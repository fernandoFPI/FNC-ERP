import { useQuery } from '@apollo/client'
import { gql } from '@apollo/client'

const PROJECT_CLOSURE_CHECK = gql`
  query ProjectClosureCheck($id: ID!) {
    project(id: $id) {
      id
      openPOsCount
      openMOsCount
      uninvoicedMilestones { id name }
      pendingTasks { id title }
    }
  }
`

export interface ClosureBlocker {
  type: 'open_pos' | 'open_mos' | 'uninvoiced_milestones' | 'pending_tasks'
  message: string
  count: number
}

export function useProjectClosure(projectId: string | null) {
  const { data, loading, refetch } = useQuery(PROJECT_CLOSURE_CHECK, {
    variables: { id: projectId },
    skip: !projectId,
    fetchPolicy: 'network-only',
  })

  const project = data?.project
  const blockers: ClosureBlocker[] = []

  if (project) {
    if ((project.openPOsCount ?? 0) > 0) {
      blockers.push({ type: 'open_pos', message: `${project.openPOsCount} open purchase order(s)`, count: project.openPOsCount })
    }
    if ((project.openMOsCount ?? 0) > 0) {
      blockers.push({ type: 'open_mos', message: `${project.openMOsCount} open manufacturing order(s)`, count: project.openMOsCount })
    }
    if ((project.uninvoicedMilestones ?? []).length > 0) {
      blockers.push({ type: 'uninvoiced_milestones', message: `${project.uninvoicedMilestones.length} uninvoiced milestone(s)`, count: project.uninvoicedMilestones.length })
    }
    if ((project.pendingTasks ?? []).length > 0) {
      blockers.push({ type: 'pending_tasks', message: `${project.pendingTasks.length} pending task(s)`, count: project.pendingTasks.length })
    }
  }

  return { canClose: blockers.length === 0, blockers, loading, refetch }
}
