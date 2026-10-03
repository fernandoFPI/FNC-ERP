import { useQuery, gql } from '@apollo/client'

const PROJECT_COMPLETION_BLOCKERS_QUERY = gql`
  query ProjectCompletionBlockers($id: ID!) {
    projectCompletionBlockers(id: $id) {
      canComplete
      blockers
    }
  }
`

interface ProjectCompletionBlockersData {
  projectCompletionBlockers: {
    canComplete: boolean
    blockers: string[]
  }
}

export function useProjectClosure(projectId: string | null) {
  const { data, loading, refetch } = useQuery<ProjectCompletionBlockersData>(
    PROJECT_COMPLETION_BLOCKERS_QUERY,
    {
      variables: { id: projectId },
      skip: !projectId,
      fetchPolicy: 'network-only',
    },
  )

  return {
    canClose: data?.projectCompletionBlockers.canComplete ?? true,
    blockers: data?.projectCompletionBlockers.blockers ?? [],
    loading,
    refetch,
  }
}
