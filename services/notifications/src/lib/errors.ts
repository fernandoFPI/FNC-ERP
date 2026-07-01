import type { Response } from 'express'

export function sendOk(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data })
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({ success: false, error: { code, message, details } })
}
