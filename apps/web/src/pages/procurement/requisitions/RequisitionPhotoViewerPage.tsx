// The route of the receipts window of a requisition in its organizer review (lib/poPhotoViewer.ts opens it): the same viewer as the
// purchase order's, on a page of its own outside the app shell.
import { useParams } from 'react-router-dom'
import { PoPhotoViewer } from '../../../components/procurement/PoPhotoViewer'

export default function RequisitionPhotoViewerPage() {
  const { id } = useParams<{ id: string }>()
  return <PoPhotoViewer requisitionId={id ?? ''} win={window} saveGeometry />
}
