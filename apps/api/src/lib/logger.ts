import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured application logger. All API logging goes through this instance
 * (or a child of it) — never through raw console.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'omnistacks-api' },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});
