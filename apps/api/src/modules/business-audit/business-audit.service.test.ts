import type { Business, BusinessAudit, WebsiteAnalysis } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import type { ChatCompletionResult } from '../../lib/openrouter.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import type { BusinessRepository } from '../businesses/businesses.repository.js';
import type { WebsiteAnalysisRepository } from '../website-analyzer/website-analyzer.repository.js';
import type { BusinessAuditRepository } from './business-audit.repository.js';
import { BusinessAuditService } from './business-audit.service.js';

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_1',
    name: 'Acme',
    website: 'https://acme.com',
    domain: 'acme.com',
    email: null,
    phone: null,
    industry: 'Retail',
    country: 'USA',
    city: 'NYC',
    status: 'ANALYZED',
    score: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function completedAnalysis(overrides: Partial<WebsiteAnalysis> = {}): WebsiteAnalysis {
  return {
    id: 'wa_1',
    businessId: 'biz_1',
    status: 'COMPLETED',
    requestedUrl: 'https://acme.com',
    finalUrl: 'https://acme.com/',
    statusCode: 200,
    redirectCount: 0,
    title: 'Acme',
    metaDescription: null,
    canonicalUrl: null,
    language: null,
    faviconUrl: null,
    headings: null,
    openGraph: null,
    twitterCard: null,
    jsonLd: null,
    internalLinks: null,
    externalLinks: null,
    navigationLinks: null,
    footerLinks: null,
    images: null,
    videos: null,
    contactForms: null,
    emails: null,
    phones: null,
    socialLinks: null,
    technologies: null,
    screenshotPath: null,
    screenshotWidth: null,
    screenshotHeight: null,
    screenshotByteSize: null,
    screenshotMimeType: null,
    durationMs: 1000,
    error: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function audit(overrides: Partial<BusinessAudit> = {}): BusinessAudit {
  return {
    id: 'audit_1',
    businessId: 'biz_1',
    websiteAnalysisId: 'wa_1',
    status: 'PENDING',
    promptVersion: 'business-audit-v1',
    model: null,
    summary: null,
    findings: null,
    score: null,
    confidence: null,
    reasons: null,
    disqualifiers: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    durationMs: null,
    error: null,
    startedAt: null,
    finishedAt: null,
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
  summary: 'Outdated site, good opportunity.',
  findings: [{ category: 'design', severity: 'medium', description: 'No mobile layout.' }],
  score: 82,
  confidence: 'high',
  reasons: ['Outdated design', 'No SEO metadata'],
};

function fakeAuditRepo(overrides: Partial<Record<keyof BusinessAuditRepository, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(audit()),
    findById: vi.fn().mockResolvedValue(audit()),
    listByBusiness: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    update: vi.fn().mockResolvedValue(audit({ status: 'COMPLETED' })),
    ...overrides,
  } as unknown as BusinessAuditRepository;
}

function fakeBusinessRepo(overrides: Partial<Record<keyof BusinessRepository, unknown>> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(business()),
    update: vi.fn().mockResolvedValue(business()),
    ...overrides,
  } as unknown as BusinessRepository;
}

function fakeAnalysisRepo(
  overrides: Partial<Record<keyof WebsiteAnalysisRepository, unknown>> = {},
) {
  return {
    findLatestCompleted: vi.fn().mockResolvedValue(completedAnalysis()),
    ...overrides,
  } as unknown as WebsiteAnalysisRepository;
}

function directLimiter(): ConcurrencyLimiter {
  return new ConcurrencyLimiter(1);
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('BusinessAuditService.start', () => {
  it('throws NotFoundError when the business does not exist', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new BusinessAuditService(
      fakeAuditRepo(),
      businesses,
      fakeAnalysisRepo(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.start('missing')).rejects.toThrow(NotFoundError);
  });

  it('throws UnprocessableError when there is no completed analysis', async () => {
    const analyses = fakeAnalysisRepo({ findLatestCompleted: vi.fn().mockResolvedValue(null) });
    const service = new BusinessAuditService(
      fakeAuditRepo(),
      fakeBusinessRepo(),
      analyses,
      vi.fn(),
      directLimiter(),
    );

    await expect(service.start('biz_1')).rejects.toThrow(UnprocessableError);
  });

  it('creates a PENDING audit immediately without waiting for the model call', async () => {
    const repo = fakeAuditRepo();
    const chat = vi.fn().mockReturnValue(new Promise(() => {}));
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    const result = await service.start('biz_1');

    expect(result.status).toBe('PENDING');
    expect(repo.create).toHaveBeenCalledWith({
      businessId: 'biz_1',
      websiteAnalysisId: 'wa_1',
      status: 'PENDING',
      promptVersion: 'business-audit-v1',
    });
  });

  it('calls the model, persists the validated result, and completes the audit', async () => {
    const repo = fakeAuditRepo();
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(1);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[0]).toEqual(['audit_1', { status: 'RUNNING', startedAt: expect.any(Date) }]);
    expect(updateCalls[1]?.[1]).toMatchObject({
      status: 'COMPLETED',
      summary: VALID_RESPONSE.summary,
      score: 82,
      confidence: 'high',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('denormalizes the score and advances ANALYZED to AUDITED', async () => {
    const businesses = fakeBusinessRepo();
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new BusinessAuditService(
      fakeAuditRepo(),
      businesses,
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(businesses.update).toHaveBeenCalledWith('biz_1', { score: 82, status: 'AUDITED' });
  });

  it('updates the score without touching status when business is already past ANALYZED', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'EMAIL_SENT' })),
    });
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new BusinessAuditService(
      fakeAuditRepo(),
      businesses,
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(businesses.update).toHaveBeenCalledWith('biz_1', { score: 82 });
  });

  it('retries once on malformed JSON, then succeeds', async () => {
    const repo = fakeAuditRepo();
    const chat = vi
      .fn()
      .mockResolvedValueOnce(chatResult('not json'))
      .mockResolvedValueOnce(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(2);
    const secondCallMessages = chat.mock.calls[1]?.[0];
    expect(secondCallMessages).toHaveLength(3);
    expect(secondCallMessages[2].content).toContain('not valid JSON');

    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({ status: 'COMPLETED', score: 82 });
  });

  it('retries once on schema-invalid JSON, then succeeds', async () => {
    const repo = fakeAuditRepo();
    const invalidShape = JSON.stringify({ ...VALID_RESPONSE, score: 500 });
    const chat = vi
      .fn()
      .mockResolvedValueOnce(chatResult(invalidShape))
      .mockResolvedValueOnce(chatResult(JSON.stringify(VALID_RESPONSE)));
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(2);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({ status: 'COMPLETED', score: 82 });
  });

  it('marks the audit FAILED after two consecutive invalid responses, never storing raw output', async () => {
    const repo = fakeAuditRepo();
    const chat = vi.fn().mockResolvedValue(chatResult('still not json'));
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      chat,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(chat).toHaveBeenCalledTimes(2);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    const failedUpdate = updateCalls[1]?.[1];
    expect(failedUpdate).toMatchObject({ status: 'FAILED' });
    expect(failedUpdate.error).toContain('invalid JSON');
    expect(failedUpdate.summary).toBeUndefined();
  });

  it('marks the audit FAILED when the chat call itself throws', async () => {
    const repo = fakeAuditRepo();
    const chat = vi.fn().mockRejectedValue(new Error('OpenRouter request failed (500): boom'));
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      chat,
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

describe('BusinessAuditService.getById', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const repo = fakeAuditRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('BusinessAuditService.listByBusiness', () => {
  it('throws NotFoundError when the business does not exist', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new BusinessAuditService(
      fakeAuditRepo(),
      businesses,
      fakeAnalysisRepo(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.listByBusiness('missing', 1, 25)).rejects.toThrow(NotFoundError);
  });

  it('paginates results', async () => {
    const repo = fakeAuditRepo({
      listByBusiness: vi.fn().mockResolvedValue({ items: [audit()], total: 51 }),
    });
    const service = new BusinessAuditService(
      repo,
      fakeBusinessRepo(),
      fakeAnalysisRepo(),
      vi.fn(),
      directLimiter(),
    );

    const result = await service.listByBusiness('biz_1', 3, 25);

    expect(repo.listByBusiness).toHaveBeenCalledWith({ businessId: 'biz_1', skip: 50, take: 25 });
    expect(result).toMatchObject({ page: 3, limit: 25, total: 51, totalPages: 3 });
  });
});
