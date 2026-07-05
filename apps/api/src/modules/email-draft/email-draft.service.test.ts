import type { Business, BusinessAudit, EmailDraft } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import type { ChatCompletionResult } from '../../lib/openrouter.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import type { N8nClient } from '../../lib/n8n-client.js';
import type { BusinessAuditRepository } from '../business-audit/business-audit.repository.js';
import type { BusinessRepository } from '../businesses/businesses.repository.js';
import type { EmailDraftRepository } from './email-draft.repository.js';
import { EmailDraftService } from './email-draft.service.js';

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_1',
    name: 'Acme',
    website: 'https://acme.com',
    domain: 'acme.com',
    email: 'hello@acme.com',
    phone: null,
    industry: 'Retail',
    country: 'USA',
    city: 'NYC',
    status: 'AUDITED',
    score: 82,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function completedAudit(overrides: Partial<BusinessAudit> = {}): BusinessAudit {
  return {
    id: 'audit_1',
    businessId: 'biz_1',
    websiteAnalysisId: 'wa_1',
    status: 'COMPLETED',
    promptVersion: 'business-audit-v1',
    model: 'anthropic/claude-sonnet-4.5',
    summary: 'Outdated site, strong opportunity.',
    findings: [],
    score: 82,
    confidence: 'high',
    reasons: ['No SEO metadata'],
    disqualifiers: [],
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    durationMs: 1000,
    error: null,
    startedAt: new Date(),
    finishedAt: new Date(),
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
    status: 'PENDING',
    promptVersion: 'email-personalization-v1',
    model: null,
    subject: null,
    opener: null,
    factUsed: null,
    body: null,
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

function chatResult(
  content: string,
  overrides: Partial<ChatCompletionResult> = {},
): ChatCompletionResult {
  return {
    id: 'chatcmpl_1',
    model: 'anthropic/claude-sonnet-4.5',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    ...overrides,
  };
}

const VALID_RESPONSE = {
  subject: 'Quick question about your site',
  opener: 'I noticed your homepage has no contact form.',
  factUsed: 'No contact form',
};

function fakeDraftRepo(overrides: Partial<Record<keyof EmailDraftRepository, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(draft()),
    findById: vi.fn().mockResolvedValue(draft()),
    listByBusiness: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    update: vi.fn().mockResolvedValue(draft({ status: 'COMPLETED' })),
    ...overrides,
  } as unknown as EmailDraftRepository;
}

function fakeBusinessRepo(overrides: Partial<Record<keyof BusinessRepository, unknown>> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(business()),
    update: vi.fn().mockResolvedValue(business()),
    ...overrides,
  } as unknown as BusinessRepository;
}

function fakeAuditRepo(overrides: Partial<Record<keyof BusinessAuditRepository, unknown>> = {}) {
  return {
    findLatestCompleted: vi.fn().mockResolvedValue(completedAudit()),
    ...overrides,
  } as unknown as BusinessAuditRepository;
}

function directLimiter(): ConcurrencyLimiter {
  return new ConcurrencyLimiter(1);
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('EmailDraftService.start', () => {
  it('throws NotFoundError when the business does not exist', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new EmailDraftService(
      fakeDraftRepo(),
      businesses,
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.start('missing')).rejects.toThrow(NotFoundError);
  });

  it('throws UnprocessableError when there is no completed audit', async () => {
    const audits = fakeAuditRepo({ findLatestCompleted: vi.fn().mockResolvedValue(null) });
    const service = new EmailDraftService(
      fakeDraftRepo(),
      fakeBusinessRepo(),
      audits,
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.start('biz_1')).rejects.toThrow(UnprocessableError);
  });

  it('creates a PENDING draft immediately without waiting for the model call', async () => {
    const repo = fakeDraftRepo();
    const chat = vi.fn().mockReturnValue(new Promise(() => {}));
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    const result = await service.start('biz_1');

    expect(result.status).toBe('PENDING');
    expect(repo.create).toHaveBeenCalledWith({
      businessId: 'biz_1',
      businessAuditId: 'audit_1',
      status: 'PENDING',
      promptVersion: 'email-personalization-v1',
    });
  });

  it('calls the model, assembles the body, and completes the draft', async () => {
    const repo = fakeDraftRepo();
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(1);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[0]).toEqual(['draft_1', { status: 'RUNNING', startedAt: expect.any(Date) }]);
    expect(updateCalls[1]?.[1]).toMatchObject({
      status: 'COMPLETED',
      subject: VALID_RESPONSE.subject,
      opener: VALID_RESPONSE.opener,
      factUsed: VALID_RESPONSE.factUsed,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(updateCalls[1]?.[1].body).toContain(VALID_RESPONSE.opener);
  });

  it('advances AUDITED to EMAIL_DRAFTED', async () => {
    const businesses = fakeBusinessRepo();
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new EmailDraftService(
      fakeDraftRepo(),
      businesses,
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(businesses.update).toHaveBeenCalledWith('biz_1', { status: 'EMAIL_DRAFTED' });
  });

  it('does not advance status when business is already past AUDITED', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'EMAIL_SENT' })),
    });
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new EmailDraftService(
      fakeDraftRepo(),
      businesses,
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(businesses.update).not.toHaveBeenCalled();
  });

  it('retries once on malformed JSON, then succeeds', async () => {
    const repo = fakeDraftRepo();
    const chat = vi
      .fn()
      .mockResolvedValueOnce(chatResult('not json'))
      .mockResolvedValueOnce(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(2);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({ status: 'COMPLETED' });
  });

  it('marks the draft FAILED after two consecutive invalid responses, never storing raw output', async () => {
    const repo = fakeDraftRepo();
    const chat = vi.fn().mockResolvedValue(chatResult('still not json'));
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(2);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    const failedUpdate = updateCalls[1]?.[1];
    expect(failedUpdate).toMatchObject({ status: 'FAILED' });
    expect(failedUpdate.error).toContain('invalid JSON');
    expect(failedUpdate.subject).toBeUndefined();
  });

  it('marks the draft FAILED when the chat call itself throws', async () => {
    const repo = fakeDraftRepo();
    const chat = vi.fn().mockRejectedValue(new Error('OpenRouter request failed (500): boom'));
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      chat,
      vi.fn(),
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({
      status: 'FAILED',
      error: 'OpenRouter request failed (500): boom',
    });
  });
});

describe('EmailDraftService.getById', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const repo = fakeDraftRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('EmailDraftService.listByBusiness', () => {
  it('throws NotFoundError when the business does not exist', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new EmailDraftService(
      fakeDraftRepo(),
      businesses,
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.listByBusiness('missing', 1, 25)).rejects.toThrow(NotFoundError);
  });

  it('paginates results', async () => {
    const repo = fakeDraftRepo({
      listByBusiness: vi.fn().mockResolvedValue({ items: [draft()], total: 51 }),
    });
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    const result = await service.listByBusiness('biz_1', 3, 25);

    expect(repo.listByBusiness).toHaveBeenCalledWith({ businessId: 'biz_1', skip: 50, take: 25 });
    expect(result).toMatchObject({ page: 3, limit: 25, total: 51, totalPages: 3 });
  });
});

describe('EmailDraftService.send', () => {
  it('throws NotFoundError for an unknown draft', async () => {
    const repo = fakeDraftRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.send('missing')).rejects.toThrow(NotFoundError);
  });

  it('throws UnprocessableError when the draft is not COMPLETED', async () => {
    const repo = fakeDraftRepo({
      findById: vi.fn().mockResolvedValue(draft({ status: 'PENDING' })),
    });
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.send('draft_1')).rejects.toThrow(UnprocessableError);
  });

  it('throws UnprocessableError when the business has no email address', async () => {
    const repo = fakeDraftRepo({
      findById: vi
        .fn()
        .mockResolvedValue(draft({ status: 'COMPLETED', subject: 'Hi', body: 'Body' })),
    });
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ email: null })),
    });
    const service = new EmailDraftService(
      repo,
      businesses,
      fakeAuditRepo(),
      vi.fn(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.send('draft_1')).rejects.toThrow(UnprocessableError);
  });

  it('triggers the n8n webhook with the assembled email and reports success', async () => {
    const repo = fakeDraftRepo({
      findById: vi
        .fn()
        .mockResolvedValue(draft({ status: 'COMPLETED', subject: 'Hi there', body: 'Full body' })),
    });
    const n8n: N8nClient = vi.fn().mockResolvedValue(true);
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      vi.fn(),
      n8n,
      directLimiter(),
    );

    const result = await service.send('draft_1');

    expect(n8n).toHaveBeenCalledWith({
      businessId: 'biz_1',
      emailDraftId: 'draft_1',
      to: 'hello@acme.com',
      subject: 'Hi there',
      body: 'Full body',
    });
    expect(result.triggered).toBe(true);
  });

  it('reports triggered: false without throwing when n8n is unreachable', async () => {
    const repo = fakeDraftRepo({
      findById: vi
        .fn()
        .mockResolvedValue(draft({ status: 'COMPLETED', subject: 'Hi', body: 'Body' })),
    });
    const n8n: N8nClient = vi.fn().mockResolvedValue(false);
    const service = new EmailDraftService(
      repo,
      fakeBusinessRepo(),
      fakeAuditRepo(),
      vi.fn(),
      n8n,
      directLimiter(),
    );

    const result = await service.send('draft_1');

    expect(result.triggered).toBe(false);
  });
});
