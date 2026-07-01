import type { Response } from 'express'

export interface ApiError {
  success: false
  error: { code: string; message: string; details?: unknown }
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiError = { success: false, error: { code, message } }
  if (details !== undefined) body.error.details = details
  res.status(status).json(body)
}

export function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data })
}
