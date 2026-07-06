import { Router } from 'express';
import { getDiscoveryJob, listDiscoveryJobs, startDiscovery } from './lead-discovery.controller.js';

/** Mounted at /lead-discovery */
export const leadDiscoveryRouter: Router = Router();
leadDiscoveryRouter.post('/', startDiscovery);
leadDiscoveryRouter.get('/', listDiscoveryJobs);
leadDiscoveryRouter.get('/:id', getDiscoveryJob);
