import type { Request, Response } from 'express'

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

// Every caller is a handler mounted on a route with this param in its path
// (e.g. '/:id'), so Express guarantees it's present — this re-asserts that
// instead of a bare `req.params['id']!`.
export function requireParam(req: Request, name: string): string {
  const v = req.params[name]
  if (v === undefined) throw new Error(`Missing route param: ${name}`)
  return v
}
