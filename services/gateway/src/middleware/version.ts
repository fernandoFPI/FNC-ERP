import type { Request, Response, NextFunction } from 'express'

export function versionHeader() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-API-Version', 'v1')
    res.setHeader('X-Service-Version', process.env.npm_package_version ?? '1.0.0')
    next()
  }
}
