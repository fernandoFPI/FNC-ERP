// The route of the receipts-and-photos window (lib/poPhotoViewer.ts opens it): the viewer on a page of its own, outside the app
// shell. The same viewer also floats as a picture-in-picture window (hooks/usePhotoPip.ts), which has no address bar.
import { useParams } from 'react-router-dom'
import { PoPhotoViewer } from '../../../components/procurement/PoPhotoViewer'

export default function PoPhotoViewerPage() {
  const { id } = useParams<{ id: string }>()
  return <PoPhotoViewer poId={id ?? ''} win={window} saveGeometry />
}
