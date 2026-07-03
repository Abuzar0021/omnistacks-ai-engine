import { Router } from 'express';
import { healthRouter } from './health.js';

export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);

// Feature routers are mounted here as they are built, e.g.:
// apiRouter.use('/campaigns', campaignsRouter);
// apiRouter.use('/leads', leadsRouter);
// apiRouter.use('/jobs', jobsRouter);
