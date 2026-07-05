import type { LeadDiscoveryJob } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import { NotFoundError } from '../../lib/errors.js';
import type { BusinessRepository } from '../businesses/businesses.repository.js';
import type { LeadDiscoveryRepository } from './lead-discovery.repository.js';
import type { StartDiscoveryInput } from './lead-discovery.schemas.js';
import { LeadDiscoveryService } from './lead-discovery.service.js';
import type { ScrapedBusiness } from './scraper.js';

function job(overrides: Partial<LeadDiscoveryJob> = {}): LeadDiscoveryJob {
  return {
    id: 'job_1',
    status: 'PENDING',
    industry: 'Saloons',
    location: 'Texas',
    country: 'United States',
    limit: 20,
    foundCount: null,
    createdCount: null,
    duplicateCount: null,
    durationMs: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function input(overrides: Partial<StartDiscoveryInput> = {}): StartDiscoveryInput {
  return {
    industry: 'Saloons',
    location: 'Texas',
    country: 'United States',
    limit: 20,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<Record<keyof LeadDiscoveryRepository, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(job()),
    findById: vi.fn().mockResolvedValue(job()),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    update: vi.fn().mockResolvedValue(job({ status: 'COMPLETED' })),
    ...overrides,
  } as unknown as LeadDiscoveryRepository;
}

function fakeBusinessRepo(overrides: Partial<Record<keyof BusinessRepository, unknown>> = {}) {
  return {
    findExistingDomains: vi.fn().mockResolvedValue(new Set<string>()),
    createMany: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as BusinessRepository;
}

/** Runs synchronously (max concurrency 1, no queueing needed in tests). */
function directLimiter(): ConcurrencyLimiter {
  return new ConcurrencyLimiter(1);
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LeadDiscoveryService.start', () => {
  it('creates a PENDING job immediately and returns it without waiting for the scrape', async () => {
    const repo = fakeRepo();
    const scrape = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    const service = new LeadDiscoveryService(repo, fakeBusinessRepo(), scrape, directLimiter());

    const result = await service.start(input());

    expect(result.status).toBe('PENDING');
    expect(repo.create).toHaveBeenCalledWith({
      status: 'PENDING',
      industry: 'Saloons',
      location: 'Texas',
      country: 'United States',
      limit: 20,
    });
  });

  it('scrapes, persists new businesses, and completes the job', async () => {
    const repo = fakeRepo();
    const businesses = fakeBusinessRepo({ createMany: vi.fn().mockResolvedValue(2) });
    const scraped: ScrapedBusiness[] = [
      {
        name: 'Acme Saloon',
        website: 'https://acme-saloon.com',
        phone: '555-1234',
        city: 'Austin',
      },
      { name: 'Lone Star Bar', website: 'https://lonestarbar.com', phone: null, city: 'Austin' },
    ];
    const scrape = vi.fn().mockResolvedValue(scraped);
    const service = new LeadDiscoveryService(repo, businesses, scrape, directLimiter());

    await service.start(input());
    await flushMicrotasks();

    expect(scrape).toHaveBeenCalledWith({ industry: 'Saloons', location: 'Texas', limit: 20 });
    expect(businesses.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Acme Saloon', domain: 'acme-saloon.com' }),
      expect.objectContaining({ name: 'Lone Star Bar', domain: 'lonestarbar.com' }),
    ]);

    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[0]).toEqual(['job_1', { status: 'RUNNING', startedAt: expect.any(Date) }]);
    expect(updateCalls[1]?.[1]).toMatchObject({
      status: 'COMPLETED',
      foundCount: 2,
      createdCount: 2,
      duplicateCount: 0,
    });
  });

  it('excludes businesses whose domain already exists and counts them as duplicates', async () => {
    const repo = fakeRepo();
    const businesses = fakeBusinessRepo({
      findExistingDomains: vi.fn().mockResolvedValue(new Set(['acme-saloon.com'])),
      createMany: vi.fn().mockResolvedValue(1),
    });
    const scraped: ScrapedBusiness[] = [
      { name: 'Acme Saloon', website: 'https://acme-saloon.com', phone: null, city: null },
      { name: 'Lone Star Bar', website: 'https://lonestarbar.com', phone: null, city: null },
    ];
    const scrape = vi.fn().mockResolvedValue(scraped);
    const service = new LeadDiscoveryService(repo, businesses, scrape, directLimiter());

    await service.start(input());
    await flushMicrotasks();

    expect(businesses.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Lone Star Bar' }),
    ]);
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({
      foundCount: 2,
      createdCount: 1,
      duplicateCount: 1,
    });
  });

  it('still inserts businesses with no resolvable website domain (not deduped)', async () => {
    const repo = fakeRepo();
    const businesses = fakeBusinessRepo({ createMany: vi.fn().mockResolvedValue(1) });
    const scraped: ScrapedBusiness[] = [
      { name: 'No Website Co', website: null, phone: null, city: null },
    ];
    const scrape = vi.fn().mockResolvedValue(scraped);
    const service = new LeadDiscoveryService(repo, businesses, scrape, directLimiter());

    await service.start(input());
    await flushMicrotasks();

    expect(businesses.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'No Website Co', domain: null }),
    ]);
  });

  it('marks the job FAILED with the error message when scraping throws', async () => {
    const repo = fakeRepo();
    const scrape = vi.fn().mockRejectedValue(new Error('navigation timeout'));
    const service = new LeadDiscoveryService(repo, fakeBusinessRepo(), scrape, directLimiter());

    await service.start(input());
    await flushMicrotasks();

    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[1]?.[1]).toMatchObject({ status: 'FAILED', error: 'navigation timeout' });
  });
});

describe('LeadDiscoveryService.getById', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new LeadDiscoveryService(repo, fakeBusinessRepo(), vi.fn(), directLimiter());

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
  });

  it('returns the job when found', async () => {
    const service = new LeadDiscoveryService(
      fakeRepo(),
      fakeBusinessRepo(),
      vi.fn(),
      directLimiter(),
    );

    await expect(service.getById('job_1')).resolves.toMatchObject({ id: 'job_1' });
  });
});

describe('LeadDiscoveryService.list', () => {
  it('paginates results', async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue({ items: [job()], total: 51 }) });
    const service = new LeadDiscoveryService(repo, fakeBusinessRepo(), vi.fn(), directLimiter());

    const result = await service.list(3, 25);

    expect(repo.list).toHaveBeenCalledWith({ skip: 50, take: 25 });
    expect(result).toMatchObject({ page: 3, limit: 25, total: 51, totalPages: 3 });
  });
});
