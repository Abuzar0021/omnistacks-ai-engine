import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

export function notFoundHandler(req: Request, res: Response): void {
  send(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    logger.warn({ path: req.path, details }, 'request validation failed');
    send(res, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ path: req.path, code: err.code, message: err.message }, 'request failed');
    send(res, err.status, err.code, err.message, err.details);
    return;
  }

  // Malformed JSON body (thrown by express.json before handlers run)
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn({ path: req.path }, 'malformed request body');
    send(res, 400, 'VALIDATION_ERROR', 'Malformed request body');
    return;
  }

  // Safety net for Prisma errors not translated by the service layer
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      logger.warn({ path: req.path }, 'unique constraint violation');
      send(res, 409, 'CONFLICT', 'Resource already exists');
      return;
    }
    if (err.code === 'P2025') {
      send(res, 404, 'NOT_FOUND', 'Resource not found');
      return;
    }
  }

  logger.error({ err, path: req.path }, 'unhandled error');
  send(res, 500, 'INTERNAL', 'Internal Server Error');
}
