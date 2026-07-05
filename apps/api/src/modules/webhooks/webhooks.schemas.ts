import { z } from 'zod';

export const emailSentWebhookSchema = z
  .object({
    businessId: z.string().min(1),
    emailDraftId: z.string().min(1),
  })
  .strict();

export const emailReplyWebhookSchema = z
  .object({
    businessId: z.string().min(1),
    classification: z.enum(['replied', 'meeting_booked']),
  })
  .strict();

export type EmailSentWebhookInput = z.infer<typeof emailSentWebhookSchema>;
export type EmailReplyWebhookInput = z.infer<typeof emailReplyWebhookSchema>;
