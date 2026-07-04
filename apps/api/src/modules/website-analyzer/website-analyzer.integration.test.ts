import { rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { getStorageRoot } from './screenshot-storage.js';
import { startFixtureServer, type FixtureServer } from './test-support/fixture-server.js';

const app = createApp();
let fixture: FixtureServer;

beforeAll(async () => {
  fixture = await startFixtureServer();
});

afterAll(async () => {
  await fixture.close();
  await rm(getStorageRoot(), { recursive: true, force: true });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "businesses", "tags", "website_analyses" RESTART IDENTITY CASCADE',
  );
});

async function createBusiness(website: string): Promise<string> {
  const res = await request(app).post('/api/businesses').send({ name: 'Fixture Co', website });
  return res.body.data.id as string;
}

async function startAnalysis(businessId: string) {
  return request(app).post(`/api/businesses/${businessId}/website-analyses`);
}

async function waitForTerminalStatus(analysisId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/website-analyses/${analysisId}`);
    if (res.body.data.status === 'COMPLETED' || res.body.data.status === 'FAILED') {
      return res.body.data;
    }
    if (Date.now() > deadline) {
      throw new Error(`Analysis ${analysisId} did not reach a terminal status in time`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('POST /api/businesses/:businessId/website-analyses', () => {
  it('returns 404 for an unknown business', async () => {
    const res = await startAnalysis('does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 422 when the business has no website', async () => {
    const create = await request(app).post('/api/businesses').send({ name: 'No Website' });
    const res = await startAnalysis(create.body.data.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE');
  });

  it('returns 202 with a PENDING analysis immediately', async () => {
    const businessId = await createBusiness('http://acme-not-yet-fetched.invalid');
    const res = await startAnalysis(businessId);

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.businessId).toBe(businessId);
  });
});

describe('full analysis pipeline against a fixture site', () => {
  it('captures every data category and completes successfully', async () => {
    const businessId = await createBusiness(fixture.httpBaseUrl);
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    expect(analysis.status).toBe('COMPLETED');
    expect(analysis.finalUrl).toBe(`${fixture.httpBaseUrl}/`);
    expect(analysis.statusCode).toBe(200);
    expect(analysis.redirectCount).toBe(0);
    expect(analysis.durationMs).toBeGreaterThan(0);

    expect(analysis.title).toBe('Acme Test Fixture');
    expect(analysis.metaDescription).toBe('A fixture page for the website analyzer.');
    expect(analysis.canonicalUrl).toBe(`${fixture.httpBaseUrl}/`);
    expect(analysis.language).toBe('en');
    expect(analysis.faviconUrl).toBe(`${fixture.httpBaseUrl}/favicon.ico`);

    expect(analysis.headings.h1).toEqual(['Welcome to Acme']);
    expect(analysis.headings.h2).toEqual(['What we do']);
    expect(analysis.headings.h3).toEqual(['Details']);

    expect(analysis.openGraph).toMatchObject({
      'og:title': 'Acme Test Fixture',
      'og:type': 'website',
    });
    expect(analysis.twitterCard).toMatchObject({ 'twitter:card': 'summary' });
    expect(analysis.jsonLd).toEqual([
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
    ]);

    const hrefs = (arr: Array<{ href: string }>) => arr.map((l) => l.href);
    expect(hrefs(analysis.navigationLinks)).toEqual([
      `${fixture.httpBaseUrl}/`,
      `${fixture.httpBaseUrl}/pricing`,
      'https://partner.example.com/',
    ]);
    expect(hrefs(analysis.footerLinks)).toEqual([
      `${fixture.httpBaseUrl}/terms`,
      `${fixture.httpBaseUrl}/privacy`,
    ]);
    expect(hrefs(analysis.internalLinks).sort()).toEqual(
      [
        `${fixture.httpBaseUrl}/`,
        `${fixture.httpBaseUrl}/pricing`,
        `${fixture.httpBaseUrl}/terms`,
        `${fixture.httpBaseUrl}/privacy`,
      ].sort(),
    );
    expect(hrefs(analysis.externalLinks).sort()).toEqual(
      [
        'https://partner.example.com/',
        'https://www.facebook.com/acme',
        'https://x.com/acme',
      ].sort(),
    );

    expect(analysis.images).toEqual([{ src: `${fixture.httpBaseUrl}/logo.png`, alt: 'Acme logo' }]);
    expect(analysis.videos).toEqual(
      expect.arrayContaining([
        { src: `${fixture.httpBaseUrl}/promo.mp4`, type: 'video' },
        { src: 'https://www.youtube.com/embed/dQw4w9WgXcQ', type: 'embed' },
      ]),
    );

    expect(analysis.contactForms).toEqual([
      {
        action: '/contact',
        method: 'post',
        fieldCount: 3,
        fieldNames: ['name', 'email', 'message'],
      },
    ]);
    expect(analysis.emails).toEqual(['hello@acme-fixture.test']);
    expect(analysis.phones).toEqual(['+1 (555) 123-4567']);
    expect(analysis.socialLinks).toEqual([
      { platform: 'FACEBOOK', url: 'https://www.facebook.com/acme' },
      { platform: 'TWITTER', url: 'https://x.com/acme' },
    ]);

    expect(analysis.technologies).toEqual([
      'WORDPRESS',
      'REACT',
      'ANGULAR',
      'GOOGLE_ANALYTICS',
      'GOOGLE_TAG_MANAGER',
    ]);

    expect(analysis.screenshotWidth).toBeGreaterThan(0);
    expect(analysis.screenshotHeight).toBeGreaterThan(0);
    expect(analysis.screenshotByteSize).toBeGreaterThan(0);
    expect(analysis.screenshotMimeType).toBe('image/png');
  });

  it('promotes the business from NEW to ANALYZED', async () => {
    const businessId = await createBusiness(fixture.httpBaseUrl);
    const started = await startAnalysis(businessId);
    await waitForTerminalStatus(started.body.data.id);

    const business = await request(app).get(`/api/businesses/${businessId}`);
    expect(business.body.data.status).toBe('ANALYZED');
  });

  it('follows redirects and records the final URL and redirect count', async () => {
    const businessId = await createBusiness(`${fixture.httpBaseUrl}/redirect`);
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    expect(analysis.status).toBe('COMPLETED');
    expect(analysis.finalUrl).toBe(`${fixture.httpBaseUrl}/landed`);
    expect(analysis.redirectCount).toBe(1);
    expect(analysis.title).toBe('Landed Page');
  });

  it('completes despite an invalid TLS certificate (ignored, not failed)', async () => {
    const businessId = await createBusiness(fixture.httpsBaseUrl);
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    expect(analysis.status).toBe('COMPLETED');
    expect(analysis.title).toBe('Acme Test Fixture');
  });

  it('marks the analysis FAILED with an error message on navigation timeout', async () => {
    const businessId = await createBusiness(`${fixture.httpBaseUrl}/hang`);
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    expect(analysis.status).toBe('FAILED');
    expect(analysis.error).toMatch(/timeout/i);
    expect(analysis.durationMs).toBeGreaterThan(0);
  });

  it('marks the analysis FAILED when the host is unreachable', async () => {
    const businessId = await createBusiness('http://127.0.0.1:1');
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    expect(analysis.status).toBe('FAILED');
    expect(analysis.error).toBeTruthy();
  });
});

describe('GET /api/website-analyses/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/website-analyses/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/businesses/:businessId/website-analyses', () => {
  it('lists analyses for a business, most recent first', async () => {
    const businessId = await createBusiness(fixture.httpBaseUrl);
    const first = await startAnalysis(businessId);
    await waitForTerminalStatus(first.body.data.id);
    const second = await startAnalysis(businessId);
    await waitForTerminalStatus(second.body.data.id);

    const res = await request(app).get(`/api/businesses/${businessId}/website-analyses`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([
      second.body.data.id,
      first.body.data.id,
    ]);
  });

  it('returns 404 for an unknown business', async () => {
    const res = await request(app).get('/api/businesses/does-not-exist/website-analyses');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/website-analyses/:id/screenshot', () => {
  it('returns metadata and a fetchable PNG file after completion', async () => {
    const businessId = await createBusiness(fixture.httpBaseUrl);
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    const meta = await request(app).get(`/api/website-analyses/${analysis.id}/screenshot`);
    expect(meta.status).toBe(200);
    expect(meta.body.data).toMatchObject({ mimeType: 'image/png' });
    expect(meta.body.data.width).toBeGreaterThan(0);

    const file = await request(app).get(meta.body.data.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.body.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('returns 404 when the analysis has no screenshot (failed before capture)', async () => {
    const businessId = await createBusiness('http://127.0.0.1:1');
    const started = await startAnalysis(businessId);
    const analysis = await waitForTerminalStatus(started.body.data.id);

    const res = await request(app).get(`/api/website-analyses/${analysis.id}/screenshot`);
    expect(res.status).toBe(404);
  });
});
