import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import type { BusinessRepository, BusinessWithTags } from './businesses.repository.js';
import { BusinessService } from './businesses.service.js';

function business(overrides: Partial<BusinessWithTags> = {}): BusinessWithTags {
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
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<Record<keyof BusinessRepository, unknown>> = {}) {
  const repo = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    findByDomain: vi.fn().mockResolvedValue(null),
    findExistingDomains: vi.fn().mockResolvedValue(new Set()),
    create: vi.fn().mockResolvedValue(business()),
    update: vi.fn().mockResolvedValue(business()),
    delete: vi.fn().mockResolvedValue(undefined),
    createMany: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
  return { repo, service: new BusinessService(repo as unknown as BusinessRepository) };
}

describe('BusinessService.create', () => {
  it('normalizes the website into a domain and stores trimmed, deduped tags', async () => {
    const { repo, service } = fakeRepo();

    await service.create({
      name: 'Acme',
      website: 'https://www.Acme.com/about',
      tags: [' saas ', 'saas', 'priority'],
    });

    expect(repo.findByDomain).toHaveBeenCalledWith('acme.com');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme', domain: 'acme.com' }),
      ['saas', 'priority'],
    );
  });

  it('rejects a duplicate domain with ConflictError', async () => {
    const { repo, service } = fakeRepo({
      findByDomain: vi.fn().mockResolvedValue(business()),
    });

    await expect(service.create({ name: 'Copy', website: 'acme.com' })).rejects.toThrow(
      ConflictError,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects an unusable website with ValidationError', async () => {
    const { repo, service } = fakeRepo();

    await expect(service.create({ name: 'Bad', website: 'not a url' })).rejects.toThrow(
      ValidationError,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates without a domain when no website is given', async () => {
    const { repo, service } = fakeRepo();

    await service.create({ name: 'No Site' });

    expect(repo.findByDomain).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'No Site', domain: null }),
      [],
    );
  });
});

describe('BusinessService.getById / delete', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const { service } = fakeRepo();

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
    await expect(service.delete('missing')).rejects.toThrow(NotFoundError);
  });

  it('deletes an existing business', async () => {
    const { repo, service } = fakeRepo({ findById: vi.fn().mockResolvedValue(business()) });

    await service.delete('biz_1');

    expect(repo.delete).toHaveBeenCalledWith('biz_1');
  });
});

describe('BusinessService.update', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const { service } = fakeRepo();

    await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundError);
  });

  it('re-derives the domain when the website changes and checks for conflicts', async () => {
    const { repo, service } = fakeRepo({ findById: vi.fn().mockResolvedValue(business()) });

    await service.update('biz_1', { website: 'https://new-site.io' });

    expect(repo.findByDomain).toHaveBeenCalledWith('new-site.io');
    expect(repo.update).toHaveBeenCalledWith(
      'biz_1',
      expect.objectContaining({ website: 'https://new-site.io', domain: 'new-site.io' }),
      undefined,
    );
  });

  it('skips the conflict check when the domain is unchanged', async () => {
    const { repo, service } = fakeRepo({ findById: vi.fn().mockResolvedValue(business()) });

    await service.update('biz_1', { website: 'https://www.acme.com/pricing' });

    expect(repo.findByDomain).not.toHaveBeenCalled();
  });

  it('clears website and domain when website is set to null', async () => {
    const { repo, service } = fakeRepo({ findById: vi.fn().mockResolvedValue(business()) });

    await service.update('biz_1', { website: null });

    expect(repo.update).toHaveBeenCalledWith(
      'biz_1',
      expect.objectContaining({ website: null, domain: null }),
      undefined,
    );
  });

  it('only touches provided fields', async () => {
    const { repo, service } = fakeRepo({ findById: vi.fn().mockResolvedValue(business()) });

    await service.update('biz_1', { status: 'CLIENT' });

    expect(repo.update).toHaveBeenCalledWith('biz_1', { status: 'CLIENT' }, undefined);
  });
});

describe('BusinessService.list', () => {
  it('translates the query into where/orderBy/pagination', async () => {
    const { repo, service } = fakeRepo({
      list: vi.fn().mockResolvedValue({ items: [business()], total: 51 }),
    });

    const result = await service.list({
      page: 3,
      limit: 25,
      sort: '-name',
      status: 'NEW',
      q: 'acme',
    });

    expect(repo.list).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'NEW',
        OR: expect.arrayContaining([
          { name: { contains: 'acme', mode: 'insensitive' } },
          { domain: { contains: 'acme', mode: 'insensitive' } },
        ]),
      }),
      orderBy: { name: 'desc' },
      skip: 50,
      take: 25,
    });
    expect(result).toMatchObject({ page: 3, limit: 25, total: 51, totalPages: 3 });
  });
});

describe('BusinessService.importCsv', () => {
  const csv = [
    'name,website,email',
    'Acme,acme.com,info@acme.com',
    'Beta,beta.io,',
    'Existing,existing.com,',
    'Bad,,broken-email',
  ].join('\n');

  it('skips existing domains, inserts the rest, and reports a full summary', async () => {
    const { repo, service } = fakeRepo({
      findExistingDomains: vi.fn().mockResolvedValue(new Set(['existing.com'])),
      createMany: vi.fn().mockResolvedValue(2),
    });

    const summary = await service.importCsv(csv);

    expect(repo.findExistingDomains).toHaveBeenCalledWith(['acme.com', 'beta.io', 'existing.com']);
    expect(repo.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Acme', domain: 'acme.com' }),
      expect.objectContaining({ name: 'Beta', domain: 'beta.io' }),
    ]);
    expect(summary).toMatchObject({
      totalRows: 4,
      imported: 2,
      skipped: 2,
      duplicates: [{ row: 4, domain: 'existing.com', reason: 'already_exists' }],
    });
    expect(summary.errors).toEqual([{ row: 5, field: 'email', message: 'Invalid email' }]);
  });

  it('propagates CSV-level validation failures', async () => {
    const { service } = fakeRepo();

    await expect(service.importCsv('')).rejects.toThrow(ValidationError);
  });
});
