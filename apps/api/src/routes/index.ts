import { Router } from 'express';
import {
  businessAuditsRouter,
  auditsRouter,
} from '../modules/business-audit/business-audit.routes.js';
import { businessesRouter } from '../modules/businesses/businesses.routes.js';
import {
  businessEmailDraftsRouter,
  emailDraftsRouter,
} from '../modules/email-draft/email-draft.routes.js';
import {
  businessWebsiteAnalysesRouter,
  websiteAnalysesRouter,
} from '../modules/website-analyzer/website-analyzer.routes.js';
import { webhooksRouter } from '../modules/webhooks/webhooks.routes.js';
import { healthRouter } from './health.js';

export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/businesses', businessesRouter);
apiRouter.use('/businesses/:businessId/website-analyses', businessWebsiteAnalysesRouter);
apiRouter.use('/website-analyses', websiteAnalysesRouter);
apiRouter.use('/businesses/:businessId/audits', businessAuditsRouter);
apiRouter.use('/business-audits', auditsRouter);
apiRouter.use('/businesses/:businessId/email-drafts', businessEmailDraftsRouter);
apiRouter.use('/email-drafts', emailDraftsRouter);
apiRouter.use('/webhooks', webhooksRouter);

// Feature routers are mounted here as they are built, e.g.:
// apiRouter.use('/campaigns', campaignsRouter);
// apiRouter.use('/jobs', jobsRouter);
