import type { Request, Response } from 'express'
import { HTTP_STATUS, ERROR_CODES } from '@fnc-erp/config'

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  })
}

export function sendValidationError(res: Response, details: unknown): void {
  sendError(
    res,
    HTTP_STATUS.BAD_REQUEST,
    ERROR_CODES.VALIDATION_ERROR,
    'Validation failed',
    details,
  )
}

export function sendInternalError(res: Response): void {
  sendError(
    res,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    ERROR_CODES.INTERNAL_ERROR,
    'An unexpected error occurred',
  )
}

// Every caller is a handler mounted on a route with this param in its path
// (e.g. '/:id'), so Express guarantees it's present — this re-asserts that
// instead of a bare `req.params['id']!`.
export function requireParam(req: Request, name: string): string {
  const v = req.params[name]
  if (v === undefined) throw new Error(`Missing route param: ${name}`)
  return v
}
