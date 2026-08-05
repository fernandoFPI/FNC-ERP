import { useEffect, useRef, useState } from 'react'
import { useSubscription } from '@apollo/client'
import { apolloClient } from '../lib/apollo'
import {
  ACQUIRE_LOCK_MUTATION,
  HEARTBEAT_LOCK_MUTATION,
  RELEASE_LOCK_MUTATION,
  LOCK_CHANGED_SUBSCRIPTION,
} from '../graphql/live'

const HEARTBEAT_INTERVAL_MS = 20_000

interface RecordLockFields {
  entityType: string
  entityId: string
  lockedBy: string
  lockedByName: string
  lockedAt: string
  lockedByMe: boolean
}

export interface RecordLockState {
  /** Still resolving the initial lock attempt — treat the record as read-only until this clears. */
  loading: boolean
  /** True once we hold the lock and can freely edit. */
  lockedByMe: boolean
  /** True when someone else holds the lock — disable inputs and show lockedByName. */
  lockedByOther: boolean
  lockedByName: string | null
}

// Google-Docs-style "someone else is editing this" for one record. Acquires
// the lock on mount, heartbeats it every 20s while held, releases on
// unmount, and live-updates (via lockChanged) if someone else's lock frees
// up or if a lock we're waiting on changes hands — see the migration
// 184_record_locks.sql header for the overall design (heartbeat + ~75s
// staleness timeout, hard block + read-only for the second viewer).
export function useRecordLock(entityType: string, entityId: string | undefined): RecordLockState {
  const [state, setState] = useState<RecordLockState>({
    loading: true,
    lockedByMe: false,
    lockedByOther: false,
    lockedByName: null,
  })
  const heldRef = useRef(false)

  async function tryAcquire() {
    if (!entityId) return
    try {
      const { data } = await apolloClient.mutate<{ acquireLock: RecordLockFields }>({
        mutation: ACQUIRE_LOCK_MUTATION,
        variables: { entityType, entityId },
      })
      const lock = data?.acquireLock
      heldRef.current = !!lock?.lockedByMe
      setState({
        loading: false,
        lockedByMe: !!lock?.lockedByMe,
        lockedByOther: !!lock && !lock.lockedByMe,
        lockedByName: lock && !lock.lockedByMe ? lock.lockedByName : null,
      })
    } catch {
      // Best-effort — if the lock service call fails, don't block the page;
      // treat as unlocked rather than trapping the user in a loading state.
      heldRef.current = false
      setState({ loading: false, lockedByMe: false, lockedByOther: false, lockedByName: null })
    }
  }

  useEffect(() => {
    if (!entityId) return
    heldRef.current = false
    setState({ loading: true, lockedByMe: false, lockedByOther: false, lockedByName: null })
    void tryAcquire()

    const heartbeat = setInterval(() => {
      if (heldRef.current) {
        void apolloClient.mutate({
          mutation: HEARTBEAT_LOCK_MUTATION,
          variables: { entityType, entityId },
        })
      }
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      clearInterval(heartbeat)
      if (heldRef.current) {
        void apolloClient.mutate({
          mutation: RELEASE_LOCK_MUTATION,
          variables: { entityType, entityId },
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  useSubscription<{ lockChanged: { lock: RecordLockFields | null } }>(LOCK_CHANGED_SUBSCRIPTION, {
    variables: { entityType, entityId: entityId ?? '' },
    skip: !entityId,
    onData: ({ data }) => {
      const lock = data.data?.lockChanged.lock
      if (!lock) {
        // Freed up — if we were blocked waiting, try to grab it now.
        if (!heldRef.current) void tryAcquire()
        return
      }
      if (lock.lockedByMe) return // our own acquire/heartbeat already updated state
      heldRef.current = false
      setState({
        loading: false,
        lockedByMe: false,
        lockedByOther: true,
        lockedByName: lock.lockedByName,
      })
    },
  })

  return state
}
