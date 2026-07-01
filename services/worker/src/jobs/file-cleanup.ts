import { pool } from '@fnc-erp/db'
import { deleteFile } from '@fnc-erp/storage'
import { createServiceLogger } from '@fnc-erp/logger'

const log = createServiceLogger('worker')

// ── Pending file cleanup (runs every hour) ─────────────────────
// Files where upload URL was generated but client never called /confirm
// after 24 hours → mark orphaned and delete from B2
export async function cleanupPendingFiles(): Promise<void> {
  const jobLog = log.child({ job: 'file-cleanup-pending' })

  try {
    const orphaned = await pool.query<{ id: string; file_key: string; original_filename: string }>(
      `SELECT id, file_key, original_filename
       FROM files
       WHERE status = 'pending'
         AND upload_url_generated_at < NOW() - INTERVAL '24 hours'
       LIMIT 50`,
    )

    if (orphaned.rows.length === 0) return

    jobLog.info({ count: orphaned.rows.length }, 'cleaning up orphaned pending files')

    for (const file of orphaned.rows) {
      try {
        await deleteFile(file.file_key)
      } catch (err) {
        // B2 returns NoSuchKey if upload never happened — that is fine
        jobLog.warn({ fileId: file.id, err }, 'B2 delete failed for pending file — may not exist in B2')
      }

      await pool.query(
        `UPDATE files SET status='orphaned', deleted_at=NOW() WHERE id=$1`,
        [file.id],
      )
    }

    jobLog.info({ count: orphaned.rows.length }, 'orphaned pending file cleanup complete')
  } catch (err) {
    jobLog.error({ err }, 'orphaned file cleanup job failed')
  }
}

// ── Unattached file review (runs daily at 03:00) ───────────────
// Files confirmed uploaded but never attached to any record after 7 days
// Marks as orphaned for admin review — does NOT delete (admin can recover)
export async function reviewUnattachedFiles(): Promise<void> {
  const jobLog = log.child({ job: 'file-cleanup-unattached' })

  try {
    const unattached = await pool.query<{ id: string; original_filename: string }>(
      `SELECT f.id, f.original_filename
       FROM files f
       WHERE f.status = 'uploaded'
         AND f.uploaded_at < NOW() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM document_attachments da WHERE da.file_id = f.id
         )
       LIMIT 50`,
    )

    if (unattached.rows.length === 0) return

    jobLog.warn({ count: unattached.rows.length }, 'files uploaded but never attached after 7 days — marking orphaned')

    await pool.query(
      `UPDATE files SET status='orphaned' WHERE id = ANY($1)`,
      [unattached.rows.map((f) => f.id)],
    )
  } catch (err) {
    jobLog.error({ err }, 'unattached file review job failed')
  }
}
