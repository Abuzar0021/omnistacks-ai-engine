import type { Business, WebsiteAnalysis } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import type { BusinessRepository } from '../businesses/businesses.repository.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import type { CaptureResult } from './types.js';
import type { WebsiteAnalysisRepository } from './website-analyzer.repository.js';
import { WebsiteAnalysisService } from './website-analyzer.service.js';

// Keeps this suite free of real disk I/O; screenshot persistence is covered
// by the integration test, which exercises the real implementation.
vi.mock('./screenshot-storage.js', () => ({
  saveScreenshot: vi.fn().mockResolvedValue({
    path: 'wa_1.png',
    width: 1,
    height: 1,
    byteSize: 24,
    mimeType: 'image/png',
  }),
}));

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_1',
    name: 'Acme',
    website: 'https://acme.com',
    domain: 'acme.com',
    email: null,
    phone: null,
    industry: null,
    country: null,
    city: null,
    status: 'NEW',
    score: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function analysis(overrides: Partial<WebsiteAnalysis> = {}): WebsiteAnalysis {
  return {
    id: 'wa_1',
    businessId: 'biz_1',
    status: 'PENDING',
    requestedUrl: 'https://acme.com',
    finalUrl: null,
    statusCode: null,
    redirectCount: null,
    title: null,
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
    durationMs: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeCapture(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    requestedUrl: 'https://acme.com',
    finalUrl: 'https://acme.com/',
    statusCode: 200,
    redirectCount: 0,
    headers: {},
    page: {
      title: 'Acme',
      metaDescription: null,
      canonicalUrl: null,
      language: null,
      faviconUrl: null,
      headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      openGraph: {},
      twitterCard: {},
      jsonLdRaw: [],
      anchors: [],
      images: [],
      videos: [],
      forms: [],
      bodyText: '',
      scriptSrcs: [],
      generatorMeta: null,
      hasWpContentAsset: false,
      hasShopifyGlobal: false,
      hasWixGlobal: false,
      hasSquarespaceGlobal: false,
      hasNextData: false,
      hasReactDevtoolsHook: false,
      hasReactRootAttr: false,
      hasVueGlobal: false,
      ngVersion: null,
      hasDataLayer: false,
      hasGtagFn: false,
      hasGaFn: false,
      hasFbq: false,
    },
    screenshot: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      1,
    ]),
    ...overrides,
  };
}

function fakeAnalysisRepo(
  overrides: Partial<Record<keyof WebsiteAnalysisRepository, unknown>> = {},
) {
  return {
    create: vi.fn().mockResolvedValue(analysis()),
    findById: vi.fn().mockResolvedValue(analysis()),
    listByBusiness: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    update: vi.fn().mockResolvedValue(analysis({ status: 'COMPLETED' })),
    ...overrides,
  } as unknown as WebsiteAnalysisRepository;
}

function fakeBusinessRepo(overrides: Partial<Record<keyof BusinessRepository, unknown>> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(business()),
    update: vi.fn().mockResolvedValue(business()),
    ...overrides,
  } as unknown as BusinessRepository;
}

/** Runs synchronously (max concurrency 1, no queueing needed in tests). */
function directLimiter(): ConcurrencyLimiter {
  return new ConcurrencyLimiter(1);
}

describe('WebsiteAnalysisService.start', () => {
  it('throws NotFoundError when the business does not exist', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new WebsiteAnalysisService(
      fakeAnalysisRepo(),
      businesses,
      vi.fn(),
      directLimiter(),
    );

    await expect(service.start('missing')).rejects.toThrow(NotFoundError);
  });

  it('throws UnprocessableError when the business has no website', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ website: null })),
    });
    const service = new WebsiteAnalysisService(
      fakeAnalysisRepo(),
      businesses,
      vi.fn(),
      directLimiter(),
    );

    await expect(service.start('biz_1')).rejects.toThrow(UnprocessableError);
  });

  it('creates a PENDING analysis immediately and returns it without waiting for capture', async () => {
    const repo = fakeAnalysisRepo();
    const capture = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), capture, directLimiter());

    const result = await service.start('biz_1');

    expect(result.status).toBe('PENDING');
    expect(repo.create).toHaveBeenCalledWith({
      businessId: 'biz_1',
      requestedUrl: 'https://acme.com',
      status: 'PENDING',
    });
  });

  it('runs the capture, persists the mapped result, and completes the analysis', async () => {
    const repo = fakeAnalysisRepo();
    const capture = vi.fn().mockResolvedValue(fakeCapture());
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), capture, directLimiter());

    await service.start('biz_1');
    await flushMicrotasks();

    expect(capture).toHaveBeenCalledWith('https://acme.com');
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[0]).toEqual(['wa_1', { status: 'RUNNING', startedAt: expect.any(Date) }]);
    const completedUpdate = updateCalls[1]?.[1];
    expect(completedUpdate).toMatchObject({
      status: 'COMPLETED',
      finalUrl: 'https://acme.com/',
      title: 'Acme',
    });
  });

  it('promotes a NEW business to ANALYZED after a successful analysis', async () => {
    const businesses = fakeBusinessRepo();
    const capture = vi.fn().mockResolvedValue(fakeCapture());
    const service = new WebsiteAnalysisService(
      fakeAnalysisRepo(),
      businesses,
      capture,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(businesses.update).toHaveBeenCalledWith('biz_1', { status: 'ANALYZED' });
  });

  it('does not change business status if it is already past NEW', async () => {
    const businesses = fakeBusinessRepo({
      findById: vi.fn().mockResolvedValue(business({ status: 'CLIENT' })),
    });
    const capture = vi.fn().mockResolvedValue(fakeCapture());
    const service = new WebsiteAnalysisService(
      fakeAnalysisRepo(),
      businesses,
      capture,
      directLimiter(),
    );

    await service.start('biz_1');
    await flushMicrotasks();

    expect(businesses.update).not.toHaveBeenCalled();
  });

  it('marks the analysis FAILED with the error message when capture throws', async () => {
    const repo = fakeAnalysisRepo();
    const capture = vi.fn().mockRejectedValue(new Error('boom'));
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), capture, directLimiter());

    await service.start('biz_1');
    await flushMicrotasks();

    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({ status: 'FAILED', error: 'boom' });
  });
});

describe('WebsiteAnalysisService.getById', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const repo = fakeAnalysisRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), vi.fn(), directLimiter());

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
  });

  it('returns the analysis when found', async () => {
    const service = new WebsiteAnalysisService(
      fakeAnalysisRepo(),
      fakeBusinessRepo(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.getById('wa_1')).resolves.toMatchObject({ id: 'wa_1' });
  });
});

describe('WebsiteAnalysisService.listByBusiness', () => {
  it('throws NotFoundError when the business does not exist', async () => {
    const businesses = fakeBusinessRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new WebsiteAnalysisService(
      fakeAnalysisRepo(),
      businesses,
      vi.fn(),
      directLimiter(),
    );

    await expect(service.listByBusiness('missing', 1, 25)).rejects.toThrow(NotFoundError);
  });

  it('paginates results', async () => {
    const repo = fakeAnalysisRepo({
      listByBusiness: vi.fn().mockResolvedValue({ items: [analysis()], total: 51 }),
    });
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), vi.fn(), directLimiter());

    const result = await service.listByBusiness('biz_1', 3, 25);

    expect(repo.listByBusiness).toHaveBeenCalledWith({ businessId: 'biz_1', skip: 50, take: 25 });
    expect(result).toMatchObject({ page: 3, limit: 25, total: 51, totalPages: 3 });
  });
});

describe('WebsiteAnalysisService.getScreenshot', () => {
  it('throws NotFoundError when the analysis has no screenshot', async () => {
    const repo = fakeAnalysisRepo({
      findById: vi.fn().mockResolvedValue(analysis({ screenshotPath: null })),
    });
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), vi.fn(), directLimiter());

    await expect(service.getScreenshot('wa_1')).rejects.toThrow(NotFoundError);
  });

  it('returns the analysis when a screenshot exists', async () => {
    const repo = fakeAnalysisRepo({
      findById: vi.fn().mockResolvedValue(analysis({ screenshotPath: 'wa_1.png' })),
    });
    const service = new WebsiteAnalysisService(repo, fakeBusinessRepo(), vi.fn(), directLimiter());

    await expect(service.getScreenshot('wa_1')).resolves.toMatchObject({
      screenshotPath: 'wa_1.png',
    });
  });
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
