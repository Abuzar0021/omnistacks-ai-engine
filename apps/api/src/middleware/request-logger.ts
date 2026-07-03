import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Assigns a request ID (honouring an inbound X-Request-Id) and emits one
 * structured log line per completed request.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : randomUUID();
  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    const level = req.path.startsWith('/api/health') ? 'debug' : 'info';
    logger[level](
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      },
      'request completed',
    );
  });

  next();
}
