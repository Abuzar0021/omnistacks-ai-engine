import { Router } from 'express';
import { getDraft, listDrafts, sendDraft, startDraft } from './email-draft.controller.js';

/** Mounted at /businesses/:businessId/email-drafts */
export const businessEmailDraftsRouter: Router = Router({ mergeParams: true });
businessEmailDraftsRouter.post('/', startDraft);
businessEmailDraftsRouter.get('/', listDrafts);

/** Mounted at /email-drafts */
export const emailDraftsRouter: Router = Router();
emailDraftsRouter.get('/:id', getDraft);
emailDraftsRouter.post('/:id/send', sendDraft);
