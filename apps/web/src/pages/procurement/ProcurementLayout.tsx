import { Outlet } from 'react-router-dom'
import { useApprovalQueueCount } from '../../hooks/useApprovalQueueCount'

export default function ProcurementLayout() {
  useApprovalQueueCount()
  return <Outlet />
}
