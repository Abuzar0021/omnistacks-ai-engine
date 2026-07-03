import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRouter: Router = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'omnistacks-api',
    timestamp: new Date().toISOString(),
  });
});

// Liveness: the process is up.
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Readiness: the process can reach its dependencies.
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'error', database: 'down' });
  }
});
