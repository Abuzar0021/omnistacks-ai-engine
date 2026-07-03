import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "businesses", "tags" RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createBusiness(payload: Record<string, unknown>) {
  return request(app).post('/api/businesses').send(payload);
}

describe('POST /api/businesses', () => {
  it('creates a business with a normalized domain and tags', async () => {
    const res = await createBusiness({
      name: 'Acme Corp',
      website: 'https://www.Acme.com/about',
      email: 'info@acme.com',
      industry: 'SaaS',
      country: 'USA',
      city: 'New York',
      tags: ['priority', 'saas'],
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Acme Corp',
      website: 'https://www.Acme.com/about',
      domain: 'acme.com',
      status: 'NEW',
      tags: ['priority', 'saas'],
    });
    expect(res.body.data.id).toBeTruthy();
  });

  it('rejects a duplicate domain with 409 CONFLICT', async () => {
    await createBusiness({ name: 'First', website: 'acme.com' });
    const res = await createBusiness({ name: 'Second', website: 'https://www.acme.com/x' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects invalid input with 400 and per-field details', async () => {
    const res = await createBusiness({ name: '', email: 'not-an-email', unknown: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('name');
    expect(paths).toContain('email');
  });

  it('rejects an unusable website with 400', async () => {
    const res = await createBusiness({ name: 'Bad Site', website: 'not a url' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('website');
  });
});

describe('GET /api/businesses/:id', () => {
  it('returns the business', async () => {
    const created = await createBusiness({ name: 'Acme', website: 'acme.com' });
    const res = await request(app).get(`/api/businesses/${created.body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.domain).toBe('acme.com');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/businesses/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/businesses (list)', () => {
  beforeEach(async () => {
    await createBusiness({ name: 'Alpha', website: 'alpha.io', country: 'USA', status: 'CLIENT' });
    await createBusiness({ name: 'Beta', website: 'beta.io', country: 'Germany' });
    await createBusiness({ name: 'Gamma', website: 'gamma.io', country: 'usa', tags: ['hot'] });
  });

  it('paginates with total counts', async () => {
    const res = await request(app).get('/api/businesses?page=2&limit=2&sort=name');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('sorts by the requested field and direction', async () => {
    const res = await request(app).get('/api/businesses?sort=-name');

    expect(res.body.data.map((b: { name: string }) => b.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/businesses?status=CLIENT');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Alpha');
  });

  it('filters by country case-insensitively', async () => {
    const res = await request(app).get('/api/businesses?country=USA');

    expect(res.body.data).toHaveLength(2);
  });

  it('filters by tag', async () => {
    const res = await request(app).get('/api/businesses?tag=hot');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Gamma');
  });

  it('searches across name and domain', async () => {
    const byName = await request(app).get('/api/businesses?q=alph');
    const byDomain = await request(app).get('/api/businesses?q=beta.io');

    expect(byName.body.data.map((b: { name: string }) => b.name)).toEqual(['Alpha']);
    expect(byDomain.body.data.map((b: { name: string }) => b.name)).toEqual(['Beta']);
  });

  it('rejects invalid query parameters', async () => {
    const res = await request(app).get('/api/businesses?status=BOGUS');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/businesses/:id', () => {
  it('updates fields and replaces tags', async () => {
    const created = await createBusiness({ name: 'Acme', website: 'acme.com', tags: ['old'] });

    const res = await request(app)
      .patch(`/api/businesses/${created.body.data.id}`)
      .send({ status: 'MEETING_BOOKED', notes: 'Call on Friday', tags: ['hot', 'q3'] });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'MEETING_BOOKED',
      notes: 'Call on Friday',
      tags: ['hot', 'q3'],
      domain: 'acme.com',
    });
  });

  it('clears website and domain when website is null', async () => {
    const created = await createBusiness({ name: 'Acme', website: 'acme.com' });

    const res = await request(app)
      .patch(`/api/businesses/${created.body.data.id}`)
      .send({ website: null });

    expect(res.status).toBe(200);
    expect(res.body.data.website).toBeNull();
    expect(res.body.data.domain).toBeNull();
  });

  it('rejects changing the domain to one that already exists', async () => {
    await createBusiness({ name: 'Taken', website: 'taken.com' });
    const created = await createBusiness({ name: 'Mine', website: 'mine.com' });

    const res = await request(app)
      .patch(`/api/businesses/${created.body.data.id}`)
      .send({ website: 'https://taken.com' });

    expect(res.status).toBe(409);
  });

  it('rejects an empty patch and unknown statuses', async () => {
    const created = await createBusiness({ name: 'Acme' });
    const id = created.body.data.id;

    expect((await request(app).patch(`/api/businesses/${id}`).send({})).status).toBe(400);
    expect(
      (await request(app).patch(`/api/businesses/${id}`).send({ status: 'NOPE' })).status,
    ).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/api/businesses/missing').send({ name: 'X' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/businesses/:id', () => {
  it('deletes and returns 204; the business is gone afterwards', async () => {
    const created = await createBusiness({ name: 'Acme', website: 'acme.com' });
    const id = created.body.data.id;

    expect((await request(app).delete(`/api/businesses/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/businesses/${id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/businesses/${id}`)).status).toBe(404);
  });
});

describe('POST /api/businesses/import', () => {
  const csv = [
    'name,website,email,phone,industry,country,city,status,notes',
    'Acme,https://www.acme.com,info@acme.com,,SaaS,USA,NYC,new,First',
    'Beta,beta.io,bad-email,,,,,,',
    'Gamma,not a url,,,,,,,',
    'Delta,https://acme.com/other,,,,,,,',
    'Epsilon,,contact@epsilon.co,,,,,,No website',
    'Zeta,https://existing.com,,,,,,client,',
  ].join('\n');

  it('imports valid rows and reports errors and duplicates per row', async () => {
    await createBusiness({ name: 'Already Here', website: 'existing.com' });

    const res = await request(app)
      .post('/api/businesses/import')
      .set('Content-Type', 'text/csv')
      .send(csv);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalRows: 6,
      imported: 2,
      skipped: 4,
    });
    expect(res.body.data.errors).toEqual([
      { row: 3, field: 'email', message: 'Invalid email' },
      { row: 4, field: 'website', message: 'Invalid website URL: "not a url"' },
    ]);
    expect(res.body.data.duplicates).toEqual([
      { row: 5, domain: 'acme.com', reason: 'duplicate_in_file' },
      { row: 7, domain: 'existing.com', reason: 'already_exists' },
    ]);

    const list = await request(app).get('/api/businesses?sort=name');
    expect(list.body.data.map((b: { name: string }) => b.name)).toEqual([
      'Acme',
      'Already Here',
      'Epsilon',
    ]);

    const acme = list.body.data.find((b: { name: string }) => b.name === 'Acme');
    expect(acme).toMatchObject({ domain: 'acme.com', status: 'NEW', city: 'NYC' });
  });

  it('rejects an empty body with 400', async () => {
    const res = await request(app)
      .post('/api/businesses/import')
      .set('Content-Type', 'text/csv')
      .send('');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
