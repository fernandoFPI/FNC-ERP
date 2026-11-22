// Shared by the tests that drive a requisition through buying. Since migration 329 the purchase orders are not created when
// the last purchase is recorded: the requisition goes to the organizer's review first (playbook #115). A test that wants the
// purchase orders passes the review the way a user would.
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

type Mut = Record<string, (...a: unknown[]) => Promise<unknown>>
const M = resolvers.Mutation as unknown as Mut

interface AnyCtx {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}

const APPROVER_EMAIL = 'review-helper-approver@fnc-erp.local'

/**
 * A system_admin of `companyId` who is nobody's organizer, for the approval a review needs when the organizer recorded a purchase
 * himself (the single-user fixtures: one admin creates, buys and organizes). One shared user, created on first use.
 */
export async function reviewApprover(companyId: string): Promise<AnyCtx> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [APPROVER_EMAIL],
  )
  return { auth: { companyId, userId: r.rows[0]!.id, role: 'system_admin', module: 'all', sessionId: 'review-helper' } }
}

/**
 * Takes a requisition that is in the organizer review through it: the organizer (or an admin acting for him, `actor`) confirms,
 * or, when a PO Admin is required (he recorded a purchase himself, or something was changed), submits it and `approver` approves.
 * `approver` must be a PO Admin or an admin who is NOT the requisition's organizer; by default a shared helper admin. Does
 * nothing for a requisition that is not in the review, so it is safe to call whether or not the last purchase moved it on.
 */
export async function passReview(reqId: string, actor: AnyCtx, approver?: AnyCtx): Promise<void> {
  const status = (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]?.status
  const who = approver ?? (await reviewApprover(actor.auth.companyId))
  if (status === 'organizer_review') {
    try {
      await M.confirmReview(null, { requisitionId: reqId }, actor)
      return
    } catch (e) {
      if (!/PO Admin must approve/.test(e instanceof Error ? e.message : String(e))) throw e
    }
    await M.submitReviewForApproval(null, { requisitionId: reqId }, actor)
    await M.approveReview(null, { requisitionId: reqId }, who)
  } else if (status === 'review_approval') {
    await M.approveReview(null, { requisitionId: reqId }, who)
  }
}
