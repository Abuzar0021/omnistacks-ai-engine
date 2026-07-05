import { Router } from 'express';
import { handleEmailReply, handleEmailSent } from './webhooks.controller.js';
import { requireWebhookSecret } from './webhook-auth.js';

/** Mounted at /webhooks. Every route requires X-Webhook-Secret (see docs/N8N.md). */
export const webhooksRouter: Router = Router();
webhooksRouter.use(requireWebhookSecret);
webhooksRouter.post('/email-sent', handleEmailSent);
webhooksRouter.post('/email-reply', handleEmailReply);
