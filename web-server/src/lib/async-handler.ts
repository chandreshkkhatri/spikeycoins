import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wrapper for async Express route handlers to catch exceptions
 * and pass them automatically to the next/error middleware.
 */
export const asyncHandler = (
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
