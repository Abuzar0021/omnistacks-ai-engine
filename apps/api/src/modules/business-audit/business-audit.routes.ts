import { Router } from 'express';
import { getAudit, listAudits, startAudit } from './business-audit.controller.js';

/** Mounted at /businesses/:businessId/audits */
export const businessAuditsRouter: Router = Router({ mergeParams: true });
businessAuditsRouter.post('/', startAudit);
businessAuditsRouter.get('/', listAudits);

/** Mounted at /business-audits */
export const auditsRouter: Router = Router();
auditsRouter.get('/:id', getAudit);
