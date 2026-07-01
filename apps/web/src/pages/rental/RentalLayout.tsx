import { Outlet } from 'react-router-dom'
import { useOverdueMaintenance } from '../../hooks/useOverdueMaintenance'
import { useApprovalStore } from '../../store/approvalStore'
import { useEffect } from 'react'

export default function RentalLayout() {
  const overdueCount = useOverdueMaintenance()
  const setOverdue = useApprovalStore((s) => s.setOverdueMaintenance)

  useEffect(() => {
    if (setOverdue) setOverdue(overdueCount)
  }, [overdueCount, setOverdue])

  return <Outlet />
}
