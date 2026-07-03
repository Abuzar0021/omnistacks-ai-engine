import { Router } from 'express';
import { businessesRouter } from '../modules/businesses/businesses.routes.js';
import { healthRouter } from './health.js';

export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/businesses', businessesRouter);

// Feature routers are mounted here as they are built, e.g.:
// apiRouter.use('/campaigns', campaignsRouter);
// apiRouter.use('/jobs', jobsRouter);
