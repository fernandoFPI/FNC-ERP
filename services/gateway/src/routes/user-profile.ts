import { Router, type Router as ExpressRouter, type Request, type Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { uploadBuffer, generateDownloadUrl } from '@fnc-erp/storage'
import { logAudit } from '@fnc-erp/audit'

export const userProfileRouter: ExpressRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const profileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  jobTitle: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  emergencyPhone: z.string().max(30).optional(),
})

// users.profile_picture stores a stable storage fileKey (e.g. avatars/{userId}.jpg),
// not a URL — presigned download URLs expire (PRESIGNED_URL_TTL_SECONDS), so a fresh
// one must be generated on every read rather than persisted.
async function freshAvatarUrl(fileKey: unknown): Promise<string | null> {
  if (!fileKey) return null
  try {
    const { downloadUrl } = await generateDownloadUrl(String(fileKey), 'avatar')
    return downloadUrl
  } catch {
    return null
  }
}

// Ties a freshly-completed profile to an HR employee record so an admin doesn't
// have to manually create/link one for every new hire. Deliberately never touches
// a row that's already linked to a DIFFERENT user_id — only fills a gap (no existing
// link in this company) or claims an unlinked (user_id IS NULL) placeholder row.
// That's what makes it safe against the duplicate-user_id bug from earlier
// (employees_company_user_unique, migration 216): there is never a moment where
// two rows in the same company hold this user_id.
async function autoLinkEmployeeRecord(
  companyId: string,
  userId: string,
  profile: { firstName: string; lastName: string; jobTitle: string | null; phone: string | null; email: string },
): Promise<void> {
  try {
    const existing = await query(
      `SELECT id FROM employees WHERE company_id = $1 AND user_id = $2`,
      [companyId, userId],
    )
    if (existing.rows[0]) {
      const existingId = existing.rows[0]['id'] as string
      // first/last name always come from the profile form (required fields);
      // job title/phone only overwrite when the user actually provided a
      // value, so leaving an optional field blank never wipes out something
      // HR already had on file for it.
      const synced = await query(
        `UPDATE employees
         SET first_name = $1, last_name = $2,
             job_title = COALESCE($3::varchar, job_title),
             phone = COALESCE($4::varchar, phone),
             updated_at = NOW()
         WHERE id = $5
           AND (first_name IS DISTINCT FROM $1 OR last_name IS DISTINCT FROM $2
                OR ($3::varchar IS NOT NULL AND job_title IS DISTINCT FROM $3::varchar)
                OR ($4::varchar IS NOT NULL AND phone IS DISTINCT FROM $4::varchar))
         RETURNING id`,
        [profile.firstName, profile.lastName, profile.jobTitle, profile.phone, existingId],
      )
      if (synced.rows[0]) {
        await logAudit({
          userId,
          companyId,
          action: 'AUTO_SYNC_EMPLOYEE_ON_PROFILE_UPDATE',
          tableName: 'employees',
          recordId: existingId,
        })
      }
      return
    }

    const placeholder = await query(
      `SELECT id FROM employees WHERE company_id = $1 AND user_id IS NULL AND lower(email) = lower($2) LIMIT 1`,
      [companyId, profile.email],
    )
    if (placeholder.rows[0]) {
      const placeholderId = placeholder.rows[0]['id'] as string
      const linked = await query(
        `UPDATE employees SET user_id = $1, updated_at = NOW()
         WHERE id = $2 AND company_id = $3 AND user_id IS NULL
         RETURNING id`,
        [userId, placeholderId, companyId],
      )
      if (linked.rows[0]) {
        await logAudit({
          userId,
          companyId,
          action: 'AUTO_LINK_EMPLOYEE_ON_PROFILE_COMPLETE',
          tableName: 'employees',
          recordId: placeholderId,
        })
      }
      return
    }

    const created = await query(
      `INSERT INTO employees (company_id, user_id, first_name, last_name, email, phone, job_title, hire_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $2)
       RETURNING id`,
      [companyId, userId, profile.firstName, profile.lastName, profile.email, profile.phone, profile.jobTitle],
    )
    await logAudit({
      userId,
      companyId,
      action: 'AUTO_CREATE_EMPLOYEE_ON_PROFILE_COMPLETE',
      tableName: 'employees',
      recordId: created.rows[0]!['id'] as string,
    })
  } catch (err) {
    console.error('[user-profile] auto-link/create employee record failed:', err)
  }
}

// GET /api/v1/users/me/profile
userProfileRouter.get('/me/profile', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId
  if (!userId) {
    res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
    return
  }

  const r = await query(
    `SELECT id, email, first_name, last_name, profile_picture, job_title,
            phone, emergency_phone, profile_completed, created_at
     FROM users WHERE id = $1`,
    [userId],
  )
  if (!r.rows[0]) {
    res.status(404).json({ success: false, error: { message: 'User not found' } })
    return
  }

  const u = r.rows[0] as Record<string, unknown>
  res.json({
    success: true,
    data: {
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      profilePicture: await freshAvatarUrl(u.profile_picture),
      jobTitle: u.job_title,
      phone: u.phone,
      emergencyPhone: u.emergency_phone,
      profileCompleted: u.profile_completed,
      createdAt: u.created_at,
    },
  })
})

// PUT /api/v1/users/me/profile
userProfileRouter.put('/me/profile', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId
  if (!userId) {
    res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
    return
  }

  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { message: 'Validation failed', details: parsed.error.flatten() },
    })
    return
  }

  const { firstName, lastName, jobTitle, phone, emergencyPhone } = parsed.data

  const r = await query(
    `UPDATE users
     SET first_name = $1, last_name = $2, job_title = $3,
         phone = $4, emergency_phone = $5, profile_completed = true, updated_at = NOW()
     WHERE id = $6
     RETURNING id, email, first_name, last_name, profile_picture, job_title,
               phone, emergency_phone, profile_completed`,
    [firstName, lastName, jobTitle ?? null, phone ?? null, emergencyPhone ?? null, userId],
  )

  const u = r.rows[0] as Record<string, unknown>

  const companyId = req.auth?.companyId
  if (companyId) {
    await autoLinkEmployeeRecord(companyId, userId, {
      firstName,
      lastName,
      jobTitle: jobTitle ?? null,
      phone: phone ?? null,
      email: u.email as string,
    })
  }

  res.json({
    success: true,
    data: {
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      profilePicture: await freshAvatarUrl(u.profile_picture),
      jobTitle: u.job_title,
      phone: u.phone,
      emergencyPhone: u.emergency_phone,
      profileCompleted: u.profile_completed,
    },
  })
})

// POST /api/v1/users/me/avatar
userProfileRouter.post(
  '/me/avatar',
  upload.single('avatar'),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
      return
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
      return
    }

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      res
        .status(400)
        .json({ success: false, error: { message: 'Only JPG, PNG or WebP images are allowed' } })
      return
    }

    const fileKey = `avatars/${userId}.${ext}`
    await uploadBuffer(req.file.buffer, fileKey, req.file.mimetype)

    await query(`UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2`, [
      fileKey,
      userId,
    ])

    const { downloadUrl } = await generateDownloadUrl(fileKey, `avatar.${ext}`)
    res.json({ success: true, data: { profilePicture: downloadUrl } })
  },
)
