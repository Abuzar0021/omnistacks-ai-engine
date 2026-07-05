import type { BusinessStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();
const SECRET = env.N8N_WEBHOOK_SECRET;

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "businesses", "tags", "website_analyses", "business_audits", "email_drafts" RESTART IDENTITY CASCADE',
  );
});

async function createBusiness(status: BusinessStatus): Promise<string> {
  const res = await request(app)
    .post('/api/businesses')
    .send({ name: 'Acme', website: 'acme.com' });
  const businessId = res.body.data.id as string;
  await prisma.business.update({ where: { id: businessId }, data: { status } });
  return businessId;
}

async function seedDraft(businessId: string): Promise<string> {
  const analysis = await prisma.websiteAnalysis.create({
    data: {
      businessId,
      status: 'COMPLETED',
      requestedUrl: 'https://acme.com',
      durationMs: 1000,
      finishedAt: new Date(),
    },
  });
  const audit = await prisma.businessAudit.create({
    data: { businessId, websiteAnalysisId: analysis.id, status: 'COMPLETED', durationMs: 1000 },
  });
  const draft = await prisma.emailDraft.create({
    data: {
      businessId,
      businessAuditId: audit.id,
      status: 'COMPLETED',
      subject: 'Hi',
      body: 'Body',
    },
  });
  return draft.id;
}

describe('webhook auth', () => {
  it('returns 401 without an X-Webhook-Secret header', async () => {
    const res = await request(app).post('/api/webhooks/email-sent').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 with an incorrect secret', async () => {
    const res = await request(app)
      .post('/api/webhooks/email-sent')
      .set('X-Webhook-Secret', 'wrong-secret')
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/webhooks/email-sent', () => {
  it('returns 400 on a malformed body', async () => {
    const res = await request(app)
      .post('/api/webhooks/email-sent')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId: 'biz_1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown draft', async () => {
    const businessId = await createBusiness('EMAIL_DRAFTED');
    const res = await request(app)
      .post('/api/webhooks/email-sent')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, emailDraftId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it('sets sentAt and advances the business to EMAIL_SENT', async () => {
    const businessId = await createBusiness('EMAIL_DRAFTED');
    const draftId = await seedDraft(businessId);

    const res = await request(app)
      .post('/api/webhooks/email-sent')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, emailDraftId: draftId });

    expect(res.status).toBe(204);

    const business = await request(app).get(`/api/businesses/${businessId}`);
    expect(business.body.data.status).toBe('EMAIL_SENT');

    const draft = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.sentAt).not.toBeNull();
  });

  it('is idempotent on re-delivery', async () => {
    const businessId = await createBusiness('EMAIL_DRAFTED');
    const draftId = await seedDraft(businessId);

    await request(app)
      .post('/api/webhooks/email-sent')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, emailDraftId: draftId });
    const second = await request(app)
      .post('/api/webhooks/email-sent')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, emailDraftId: draftId });

    expect(second.status).toBe(204);
    const business = await request(app).get(`/api/businesses/${businessId}`);
    expect(business.body.data.status).toBe('EMAIL_SENT');
  });
});

describe('POST /api/webhooks/email-reply', () => {
  it('returns 400 for an invalid classification', async () => {
    const businessId = await createBusiness('EMAIL_SENT');
    const res = await request(app)
      .post('/api/webhooks/email-reply')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, classification: 'not-a-real-value' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown business', async () => {
    const res = await request(app)
      .post('/api/webhooks/email-reply')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId: 'does-not-exist', classification: 'replied' });
    expect(res.status).toBe(404);
  });

  it('advances EMAIL_SENT to RESPONDED', async () => {
    const businessId = await createBusiness('EMAIL_SENT');

    const res = await request(app)
      .post('/api/webhooks/email-reply')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, classification: 'replied' });

    expect(res.status).toBe(204);
    const business = await request(app).get(`/api/businesses/${businessId}`);
    expect(business.body.data.status).toBe('RESPONDED');
  });

  it('advances EMAIL_SENT directly to MEETING_BOOKED', async () => {
    const businessId = await createBusiness('EMAIL_SENT');

    const res = await request(app)
      .post('/api/webhooks/email-reply')
      .set('X-Webhook-Secret', SECRET)
      .send({ businessId, classification: 'meeting_booked' });

    expect(res.status).toBe(204);
    const business = await request(app).get(`/api/businesses/${businessId}`);
    expect(business.body.data.status).toBe('MEETING_BOOKED');
  });
});
