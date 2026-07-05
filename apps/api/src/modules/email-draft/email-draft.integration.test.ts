import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const chatCompletion = vi.fn();
vi.mock('../../lib/openrouter.js', () => ({ chatCompletion }));
const triggerOutreachSend = vi.fn();
vi.mock('../../lib/n8n-client.js', () => ({ triggerOutreachSend }));

const { createApp } = await import('../../app.js');
const { prisma } = await import('../../lib/prisma.js');

const app = createApp();

const VALID_RESPONSE = {
  subject: 'Quick question about your site',
  opener: 'I noticed your homepage has no contact form.',
  factUsed: 'No contact form',
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
    'TRUNCATE TABLE "businesses", "tags", "website_analyses", "business_audits", "email_drafts" RESTART IDENTITY CASCADE',
  );
  chatCompletion.mockReset();
  triggerOutreachSend.mockReset();
});

async function createBusiness(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/businesses')
    .send({ name: 'Acme', website: 'acme.com', email: 'hello@acme.com', ...overrides });
  return res.body.data.id as string;
}

async function seedCompletedAudit(businessId: string): Promise<string> {
  const analysis = await prisma.websiteAnalysis.create({
    data: {
      businessId,
      status: 'COMPLETED',
      requestedUrl: 'https://acme.com',
      finalUrl: 'https://acme.com/',
      statusCode: 200,
      redirectCount: 0,
      title: 'Acme Corp',
      durationMs: 1000,
      finishedAt: new Date(),
    },
  });
  const audit = await prisma.businessAudit.create({
    data: {
      businessId,
      websiteAnalysisId: analysis.id,
      status: 'COMPLETED',
      summary: 'Outdated site, strong opportunity.',
      findings: [],
      score: 82,
      confidence: 'high',
      reasons: ['No SEO metadata'],
      disqualifiers: [],
      durationMs: 1000,
      finishedAt: new Date(),
    },
  });
  return audit.id;
}

async function startDraft(businessId: string) {
  return request(app).post(`/api/businesses/${businessId}/email-drafts`);
}

async function waitForTerminalStatus(draftId: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/email-drafts/${draftId}`);
    if (res.body.data.status === 'COMPLETED' || res.body.data.status === 'FAILED') {
      return res.body.data;
    }
    if (Date.now() > deadline) {
      throw new Error(`Draft ${draftId} did not reach a terminal status in time`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * The business-status promotion happens in a separate await *after* the draft
 * row is marked COMPLETED, so polling the draft alone can race ahead of it —
 * poll the business row too rather than assuming it's already settled.
 */
async function waitForBusinessStatus(businessId: string, status: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/businesses/${businessId}`);
    if (res.body.data.status === status) return res.body.data;
    if (Date.now() > deadline) return res.body.data;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('POST /api/businesses/:businessId/email-drafts', () => {
  it('returns 404 for an unknown business', async () => {
    const res = await startDraft('does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 422 when there is no completed audit', async () => {
    const businessId = await createBusiness();
    const res = await startDraft(businessId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE');
  });

  it('returns 202 with a PENDING draft immediately', async () => {
    const businessId = await createBusiness();
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const res = await startDraft(businessId);

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.businessId).toBe(businessId);

    // Drain the background job so it can't race the next test's TRUNCATE.
    await waitForTerminalStatus(res.body.data.id);
  });
});

describe('full draft pipeline with a mocked model', () => {
  it('completes, persists the assembled email, and promotes the business to EMAIL_DRAFTED', async () => {
    const businessId = await createBusiness();
    await prisma.business.update({ where: { id: businessId }, data: { status: 'AUDITED' } });
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const started = await startDraft(businessId);
    const result = await waitForTerminalStatus(started.body.data.id);

    expect(result.status).toBe('COMPLETED');
    expect(result.subject).toBe(VALID_RESPONSE.subject);
    expect(result.opener).toBe(VALID_RESPONSE.opener);
    expect(result.factUsed).toBe(VALID_RESPONSE.factUsed);
    expect(result.body).toContain(VALID_RESPONSE.opener);
    expect(result.totalTokens).toBe(150);

    const business = await waitForBusinessStatus(businessId, 'EMAIL_DRAFTED');
    expect(business.status).toBe('EMAIL_DRAFTED');
  });

  it('does not advance status when the business is already past AUDITED', async () => {
    const businessId = await createBusiness();
    await prisma.business.update({ where: { id: businessId }, data: { status: 'CLIENT' } });
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const started = await startDraft(businessId);
    await waitForTerminalStatus(started.body.data.id);

    const business = await request(app).get(`/api/businesses/${businessId}`);
    expect(business.body.data.status).toBe('CLIENT');
  });

  it('marks the draft FAILED after two invalid responses, never storing raw output', async () => {
    const businessId = await createBusiness();
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult('still not valid json'));

    const started = await startDraft(businessId);
    const result = await waitForTerminalStatus(started.body.data.id);

    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('FAILED');
    expect(result.subject).toBeNull();
  });
});

describe('POST /api/email-drafts/:id/send', () => {
  it('returns 404 for an unknown draft', async () => {
    const res = await request(app).post('/api/email-drafts/does-not-exist/send');
    expect(res.status).toBe(404);
  });

  it('returns 422 when the draft is not completed', async () => {
    const businessId = await createBusiness();
    await seedCompletedAudit(businessId);
    // Never resolves, so the draft deterministically stays PENDING rather than
    // racing the background job to COMPLETED before the request below runs.
    chatCompletion.mockReturnValue(new Promise(() => {}));
    const started = await startDraft(businessId);

    const res = await request(app).post(`/api/email-drafts/${started.body.data.id}/send`);
    expect(res.status).toBe(422);
  });

  it('returns 422 when the business has no email address', async () => {
    const businessId = await createBusiness({ email: null });
    await prisma.business.update({ where: { id: businessId }, data: { status: 'AUDITED' } });
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    const started = await startDraft(businessId);
    const completed = await waitForTerminalStatus(started.body.data.id);

    const res = await request(app).post(`/api/email-drafts/${completed.id}/send`);
    expect(res.status).toBe(422);
  });

  it('triggers the n8n webhook and returns 202 with triggered: true', async () => {
    const businessId = await createBusiness();
    await prisma.business.update({ where: { id: businessId }, data: { status: 'AUDITED' } });
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));
    triggerOutreachSend.mockResolvedValue(true);
    const started = await startDraft(businessId);
    const completed = await waitForTerminalStatus(started.body.data.id);

    const res = await request(app).post(`/api/email-drafts/${completed.id}/send`);

    expect(res.status).toBe(202);
    expect(res.body.triggered).toBe(true);
    expect(triggerOutreachSend).toHaveBeenCalledWith(
      expect.objectContaining({ businessId, emailDraftId: completed.id, to: 'hello@acme.com' }),
    );
  });
});

describe('GET /api/businesses/:businessId/email-drafts', () => {
  it('lists drafts for a business, most recent first, paginated', async () => {
    const businessId = await createBusiness();
    await seedCompletedAudit(businessId);
    chatCompletion.mockResolvedValue(chatResult(JSON.stringify(VALID_RESPONSE)));

    const first = await startDraft(businessId);
    await waitForTerminalStatus(first.body.data.id);
    const second = await startDraft(businessId);
    await waitForTerminalStatus(second.body.data.id);

    const res = await request(app).get(`/api/businesses/${businessId}/email-drafts`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual([
      second.body.data.id,
      first.body.data.id,
    ]);
  });

  it('returns 404 for an unknown business', async () => {
    const res = await request(app).get('/api/businesses/does-not-exist/email-drafts');
    expect(res.status).toBe(404);
  });
});
