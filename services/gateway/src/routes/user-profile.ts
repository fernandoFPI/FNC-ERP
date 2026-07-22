import { Router, type Router as ExpressRouter, type Request, type Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { uploadBuffer, generateDownloadUrl } from '@fnc-erp/storage'

export const userProfileRouter: ExpressRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const profileSchema = z.object({
  firstName:      z.string().min(1).max(100),
  lastName:       z.string().min(1).max(100),
  jobTitle:       z.string().max(100).optional(),
  phone:          z.string().max(30).optional(),
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

// GET /api/v1/users/me/profile
userProfileRouter.get('/me/profile', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId
  if (!userId) { res.status(401).json({ success: false, error: { message: 'Unauthorized' } }); return }

  const r = await query(
    `SELECT id, email, first_name, last_name, profile_picture, job_title,
            phone, emergency_phone, profile_completed, created_at
     FROM users WHERE id = $1`,
    [userId],
  )
  if (!r.rows[0]) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return }

  const u = r.rows[0] as Record<string, unknown>
  res.json({
    success: true,
    data: {
      id:               u['id'],
      email:            u['email'],
      firstName:        u['first_name'],
      lastName:         u['last_name'],
      profilePicture:   await freshAvatarUrl(u['profile_picture']),
      jobTitle:         u['job_title'],
      phone:            u['phone'],
      emergencyPhone:   u['emergency_phone'],
      profileCompleted: u['profile_completed'],
      createdAt:        u['created_at'],
    },
  })
})

// PUT /api/v1/users/me/profile
userProfileRouter.put('/me/profile', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId
  if (!userId) { res.status(401).json({ success: false, error: { message: 'Unauthorized' } }); return }

  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { message: 'Validation failed', details: parsed.error.flatten() } })
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
  res.json({
    success: true,
    data: {
      id:               u['id'],
      email:            u['email'],
      firstName:        u['first_name'],
      lastName:         u['last_name'],
      profilePicture:   await freshAvatarUrl(u['profile_picture']),
      jobTitle:         u['job_title'],
      phone:            u['phone'],
      emergencyPhone:   u['emergency_phone'],
      profileCompleted: u['profile_completed'],
    },
  })
})

// POST /api/v1/users/me/avatar
userProfileRouter.post(
  '/me/avatar',
  upload.single('avatar'),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId
    if (!userId) { res.status(401).json({ success: false, error: { message: 'Unauthorized' } }); return }
    if (!req.file) { res.status(400).json({ success: false, error: { message: 'No file uploaded' } }); return }

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      res.status(400).json({ success: false, error: { message: 'Only JPG, PNG or WebP images are allowed' } })
      return
    }

    const fileKey = `avatars/${userId}.${ext}`
    await uploadBuffer(req.file.buffer, fileKey, req.file.mimetype)

    await query(
      `UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2`,
      [fileKey, userId],
    )

    const { downloadUrl } = await generateDownloadUrl(fileKey, `avatar.${ext}`)
    res.json({ success: true, data: { profilePicture: downloadUrl } })
  },
)
