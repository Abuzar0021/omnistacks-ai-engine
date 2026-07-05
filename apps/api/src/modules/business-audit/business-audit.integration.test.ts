import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const chatCompletion = vi.fn();
vi.mock('../../lib/openrouter.js', () => ({ chatCompletion }));

const { createApp } = await import('../../app.js');
const { prisma } = await import('../../lib/prisma.js');

const app = createApp();

const VALID_RESPONSE = {
  summary: 'Outdated site, strong opportunity.',
  findings: [{ category: 'seo', severity: 'high', description: 'No meta description found.' }],
  score: 88,
  confidence: 'high',
  reasons: ['No SEO metadata', 'No mobile-friendly design'],
};

function chatResult(content: string) {
  return {
    id: 'chatcmpl_1',
    model: 'anthropic/claude-sonnet-4.5',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "businesses", "tags", "website_analyses", "business_audits" RESTART IDENTITY CASCADE',
  );
  chatCompletion.mockReset();
});

async function createBusiness(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/businesses')
    .send({ name: 'Acme', website: 'acme.com', ...overrides });
  return res.body.data.id as string;
}

async function seedCompletedAnalysis(businessId: string): Promise<string> {
  const analysis = await prisma.websiteAnalysis.create({
    data: {
      businessId,
      status: 'COMPLETED',
      requestedUrl: 'https://acme.com',
      finalUrl: 'https://acme.com/',
      statusCode: 200,
      redirectCount: 0,
      title: 'Acme Corp',
      metaDescription: 'We make widgets',
      technologies: ['WORDPRESS'],
      internalLinks: [{ href: 'https://acme.com/about', text: 'About' }],
      externalLinks: [],
      emails: ['hello@acme.com'],
      phones: [],
      socialLinks: [],
      contactForms: [],
      headings: { h1: ['Welcome'], h2: [], h3: [], h4: [], h5: [], h6: [] },
      durationMs: 1000,
      finishedAt: new Date(),
    },
  });
  return analysis.id;
}

async function startAudit(businessId: string) {
  return request(app).post(`/api/businesses/${businessId}/audits`);
}

async function waitForTerminalStatus(auditId: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/business-audits/${auditId}`);
    if (res.body.data.status === 'COMPLETED' || res.body.data.status === 'FAILED') {
      return res.body.data;
    }
    if (Date.now() > deadline) {
      throw new Error(`Audit ${auditId} did not reach a terminal status in time`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * The business-score/status side effect happens in a separate await *after*
 * the audit row is marked COMPLETED, so polling the audit alone can race
 * ahead of it — poll the business row too rather than assuming it's settled.
 */
async function waitForBusinessScore(businessId: string, score: number, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/businesses/${businessId}`);
    if (res.body.data.score === score) return res.body.data;
    if (Date.now() > deadline) return res.body.data;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('POST /api/businesses/:businessId/audits', () => {
  it('returns 404 for an unknown business', async () => {
    const res = await startAudit('does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 422 when there is no completed website analysis', async () => {
    const businessId = await createBusiness();
    const res = await startAudit(businessId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE');
  });

  it('returns 202 with a PENDING audit immediately', async () => {
    const businessId = await createBusiness();
    await seedCompletedAnalysis(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const res = await startAudit(businessId);

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.businessId).toBe(businessId);
  });
});

describe('full audit pipeline with a mocked model', () => {
  it('completes, persists findings/score, and promotes the business to AUDITED', async () => {
    const businessId = await createBusiness();
    await prisma.business.update({ where: { id: businessId }, data: { status: 'ANALYZED' } });
    await seedCompletedAnalysis(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const started = await startAudit(businessId);
    const auditResult = await waitForTerminalStatus(started.body.data.id);

    expect(auditResult.status).toBe('COMPLETED');
    expect(auditResult.summary).toBe(VALID_RESPONSE.summary);
    expect(auditResult.findings).toEqual(VALID_RESPONSE.findings);
    expect(auditResult.score).toBe(88);
    expect(auditResult.confidence).toBe('high');
    expect(auditResult.reasons).toEqual(VALID_RESPONSE.reasons);
    expect(auditResult.promptTokens).toBe(100);
    expect(auditResult.completionTokens).toBe(50);
    expect(auditResult.totalTokens).toBe(150);
    expect(auditResult.durationMs).toBeGreaterThanOrEqual(0);

    const business = await waitForBusinessScore(businessId, 88);
    expect(business.score).toBe(88);
    expect(business.status).toBe('AUDITED');
  });

  it('does not advance status when the business is already past ANALYZED', async () => {
    const businessId = await createBusiness();
    await prisma.business.update({ where: { id: businessId }, data: { status: 'CLIENT' } });
    await seedCompletedAnalysis(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const started = await startAudit(businessId);
    await waitForTerminalStatus(started.body.data.id);

    const business = await waitForBusinessScore(businessId, 88);
    expect(business.score).toBe(88);
    expect(business.status).toBe('CLIENT');
  });

  it('retries once on malformed JSON and still completes', async () => {
    const businessId = await createBusiness();
    await seedCompletedAnalysis(businessId);
    chatCompletion
      .mockResolvedValueOnce(chatResult('not valid json'))
      .mockResolvedValueOnce(chatResult(JSON.stringify(VALID_RESPONSE)));

    const started = await startAudit(businessId);
    const auditResult = await waitForTerminalStatus(started.body.data.id);

    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(auditResult.status).toBe('COMPLETED');
    expect(auditResult.score).toBe(88);
  });

  it('marks the audit FAILED after two invalid responses, never storing raw output', async () => {
    const businessId = await createBusiness();
    await seedCompletedAnalysis(businessId);
    chatCompletion.mockResolvedValue(chatResult('still not valid json'));

    const started = await startAudit(businessId);
    const auditResult = await waitForTerminalStatus(started.body.data.id);

    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(auditResult.status).toBe('FAILED');
    expect(auditResult.error).toContain('invalid JSON');
    expect(auditResult.summary).toBeNull();
    expect(auditResult.score).toBeNull();
  });

  it('marks the audit FAILED when the model call throws', async () => {
    const businessId = await createBusiness();
    await seedCompletedAnalysis(businessId);
    chatCompletion.mockRejectedValue(new Error('OpenRouter request failed (500): boom'));

    const started = await startAudit(businessId);
    const auditResult = await waitForTerminalStatus(started.body.data.id);

    expect(auditResult.status).toBe('FAILED');
    expect(auditResult.error).toBe('OpenRouter request failed (500): boom');
  });
});

describe('GET /api/business-audits/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/business-audits/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/businesses/:businessId/audits', () => {
  it('lists audits for a business, most recent first, paginated', async () => {
    const businessId = await createBusiness();
    await seedCompletedAnalysis(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const first = await startAudit(businessId);
    await waitForTerminalStatus(first.body.data.id);
    const second = await startAudit(businessId);
    await waitForTerminalStatus(second.body.data.id);

    const res = await request(app).get(`/api/businesses/${businessId}/audits`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([
      second.body.data.id,
      first.body.data.id,
    ]);
  });

  it('returns 404 for an unknown business', async () => {
    const res = await request(app).get('/api/businesses/does-not-exist/audits');
    expect(res.status).toBe(404);
  });
});
