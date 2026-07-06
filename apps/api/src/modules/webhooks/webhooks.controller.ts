import { asyncHandler } from '../../lib/async-handler.js';
import { emailReplyWebhookSchema, emailSentWebhookSchema } from './webhooks.schemas.js';
import { webhooksService } from './webhooks.service.js';

export const handleEmailSent = asyncHandler(async (req, res) => {
  const input = emailSentWebhookSchema.parse(req.body);
  await webhooksService.handleEmailSent(input.businessId, input.emailDraftId);
  res.status(204).end();
});

export const handleEmailReply = asyncHandler(async (req, res) => {
  const input = emailReplyWebhookSchema.parse(req.body);
  await webhooksService.handleEmailReply(input.businessId, input.classification);
  res.status(204).end();
});
