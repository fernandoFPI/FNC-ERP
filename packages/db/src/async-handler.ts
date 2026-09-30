import type { NextFunction, Request, RequestHandler, Response } from 'express'

// Express's RequestHandler type wants a synchronous void return; an async
// route handler's Promise<void> doesn't satisfy that, which is a structural
// mismatch, not a bug — every route handler already catches its own errors
// in a try/catch. This wrapper satisfies the type AND adds a real safety
// net on top: an error that somehow escapes a handler's own try/catch (a
// bug, not the common case) is forwarded to next() instead of becoming an
// unhandled rejection.
export function asyncHandler<Req extends Request = Request>(
  // The handler's resolved value is discarded below — some existing handlers
  // use `return res.json(...)` as shorthand for "send and stop", which types
  // as Promise<Response>, not Promise<void>; both are fine here.
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next)
  }
}
