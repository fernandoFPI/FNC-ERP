import type { Response } from 'express'
import { HTTP_STATUS, ERROR_CODES, type ErrorCode } from '@fnc-erp/config'

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode | string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  })
}

export function sendValidationError(res: Response, details: unknown): void {
  sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Validation failed', details)
}

export function sendInternalError(res: Response): void {
  sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR, 'An unexpected error occurred')
}
