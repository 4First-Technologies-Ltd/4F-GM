import { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
