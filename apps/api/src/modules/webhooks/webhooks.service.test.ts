import type { Business, EmailDraft } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import type { BusinessRepository } from '../businesses/businesses.repository.js';
import type { EmailDraftRepository } from '../email-draft/email-draft.repository.js';
import { WebhooksService } from './webhooks.service.js';

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_1',
    name: 'Acme',
    website: 'https://acme.com',
    domain: 'acme.com',
    email: 'hello@acme.com',
    phone: null,
    industry: null,
    country: null,
    city: null,
    status: 'EMAIL_DRAFTED',
    score: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function draft(overrides: Partial<EmailDraft> = {}): EmailDraft {
  return {
    id: 'draft_1',
    businessId: 'biz_1',
    businessAuditId: 'audit_1',
    status: 'COMPLETED',
    promptVersion: 'email-personalization-v1',
    model: 'anthropic/claude-sonnet-4.5',
    subject: 'Hi',
    opener: 'Opener',
    factUsed: null,
    body: 'Body',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    durationMs: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeBusinessRepo(overrides: Partial<Record<keyof BusinessRepository, unknown>> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(business()),
    update: vi.fn().mockResolvedValue(business()),
    ...overrides,
  } as unknown as BusinessRepository;
}

function fakeDraftRepo(overrides: Partial<Record<keyof EmailDraftRepository, unknown>> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(draft()),
    update: vi.fn().mockResolvedValue(draft({ sentAt: new Date() })),
    ...overrides,
  } as unknown as EmailDraftRepository;
}

describe('WebhooksService.handleEmailSent', () => {
  it('throws NotFoundError for an unknown draft', async () => {
    const drafts = fakeDraftRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new WebhooksService(fakeBusinessRepo(), drafts);

    await expect(service.handleEmailSent('biz_1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('throws UnprocessableError when the draft belongs to a different business', async () => {
    const drafts = fakeDraftRepo({
      findById: vi.fn().mockResolvedValue(draft({ businessId: 'other-biz' })),
    });
    const service = new WebhooksService(fakeBusinessRepo(), drafts);

    await expect(service.handleEmailSent('biz_1', 'draft_1')).rejects.toThrow(UnprocessableError);
  });

  it('throws NotFoundError for an unknown business', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new WebhooksService(businesses, fakeDraftRepo());

    await expect(service.handleEmailSent('biz_1', 'draft_1')).rejects.toThrow(NotFoundError);
  });

  it('sets sentAt and advances EMAIL_DRAFTED to EMAIL_SENT', async () => {
    const businesses = fakeBusinessRepo();
    const drafts = fakeDraftRepo();
    const service = new WebhooksService(businesses, drafts);

    await service.handleEmailSent('biz_1', 'draft_1');

    expect(drafts.update).toHaveBeenCalledWith('draft_1', { sentAt: expect.any(Date) });
    expect(businesses.update).toHaveBeenCalledWith('biz_1', { status: 'EMAIL_SENT' });
  });

  it('is idempotent on re-delivery (sentAt already set, business already EMAIL_SENT)', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'EMAIL_SENT' })),
    });
    const drafts = fakeDraftRepo({
      findById: vi.fn().mockResolvedValue(draft({ sentAt: new Date() })),
    });
    const service = new WebhooksService(businesses, drafts);

    await service.handleEmailSent('biz_1', 'draft_1');

    expect(drafts.update).not.toHaveBeenCalled();
    expect(businesses.update).not.toHaveBeenCalled();
  });

  it('never regresses a business further along the pipeline', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'MEETING_BOOKED' })),
    });
    const service = new WebhooksService(businesses, fakeDraftRepo());

    await service.handleEmailSent('biz_1', 'draft_1');

    expect(businesses.update).not.toHaveBeenCalled();
  });
});

describe('WebhooksService.handleEmailReply', () => {
  it('throws NotFoundError for an unknown business', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new WebhooksService(businesses, fakeDraftRepo());

    await expect(service.handleEmailReply('missing', 'replied')).rejects.toThrow(NotFoundError);
  });

  it('advances EMAIL_SENT to RESPONDED on a "replied" classification', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'EMAIL_SENT' })),
    });
    const service = new WebhooksService(businesses, fakeDraftRepo());

    await service.handleEmailReply('biz_1', 'replied');

    expect(businesses.update).toHaveBeenCalledWith('biz_1', { status: 'RESPONDED' });
  });

  it('advances directly to MEETING_BOOKED on a "meeting_booked" classification, skipping RESPONDED', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'EMAIL_SENT' })),
    });
    const service = new WebhooksService(businesses, fakeDraftRepo());

    await service.handleEmailReply('biz_1', 'meeting_booked');

    expect(businesses.update).toHaveBeenCalledWith('biz_1', { status: 'MEETING_BOOKED' });
  });

  it('never regresses MEETING_BOOKED back to RESPONDED', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'MEETING_BOOKED' })),
    });
    const service = new WebhooksService(businesses, fakeDraftRepo());

    await service.handleEmailReply('biz_1', 'replied');

    expect(businesses.update).not.toHaveBeenCalled();
  });
});
