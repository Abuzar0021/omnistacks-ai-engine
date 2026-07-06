import { Router } from 'express';
import {
  getAnalysis,
  getScreenshotFile,
  getScreenshotMeta,
  listAnalyses,
  startAnalysis,
} from './website-analyzer.controller.js';

/** Mounted at /businesses/:businessId/website-analyses */
export const businessWebsiteAnalysesRouter: Router = Router({ mergeParams: true });
businessWebsiteAnalysesRouter.post('/', startAnalysis);
businessWebsiteAnalysesRouter.get('/', listAnalyses);

/** Mounted at /website-analyses */
export const websiteAnalysesRouter: Router = Router();
websiteAnalysesRouter.get('/:id', getAnalysis);
websiteAnalysesRouter.get('/:id/screenshot', getScreenshotMeta);
websiteAnalysesRouter.get('/:id/screenshot/file', getScreenshotFile);
