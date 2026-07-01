import type { Response } from 'express'

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ success: false, error: { code, message, details } })
}

export function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data })
}
