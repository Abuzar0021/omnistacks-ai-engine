import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "businesses", "tags", "lead_discovery_jobs" RESTART IDENTITY CASCADE',
  );
});

async function waitForTerminalStatus(jobId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/lead-discovery/${jobId}`);
    if (res.body.data.status === 'COMPLETED' || res.body.data.status === 'FAILED') {
      return res.body.data;
    }
    if (Date.now() > deadline) {
      throw new Error(`Lead discovery job ${jobId} did not reach a terminal status in time`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('POST /api/lead-discovery', () => {
  it('returns 400 when industry is missing', async () => {
    const res = await request(app).post('/api/lead-discovery').send({ location: 'Texas' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when location is missing', async () => {
    const res = await request(app).post('/api/lead-discovery').send({ industry: 'Saloons' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when limit exceeds the maximum', async () => {
    const res = await request(app)
      .post('/api/lead-discovery')
      .send({ industry: 'Saloons', location: 'Texas', limit: 999 });
    expect(res.status).toBe(400);
  });

  it('returns 202 with a PENDING job immediately', async () => {
    const res = await request(app)
      .post('/api/lead-discovery')
      .send({ industry: 'Saloons', location: 'Texas', country: 'United States' });

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({
      status: 'PENDING',
      industry: 'Saloons',
      location: 'Texas',
      country: 'United States',
      limit: 20,
    });
  });

  it('marks the job FAILED when the directory is unreachable (test default YELP_BASE_URL)', async () => {
    const started = await request(app)
      .post('/api/lead-discovery')
      .send({ industry: 'Saloons', location: 'Texas' });

    const job = await waitForTerminalStatus(started.body.data.id);

    expect(job.status).toBe('FAILED');
    expect(job.error).toBeTruthy();
  });
});

describe('GET /api/lead-discovery/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/lead-discovery/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/lead-discovery', () => {
  it('lists jobs, most recent first, paginated', async () => {
    const first = await request(app)
      .post('/api/lead-discovery')
      .send({ industry: 'Saloons', location: 'Texas' });
    const second = await request(app)
      .post('/api/lead-discovery')
      .send({ industry: 'Cafes', location: 'Oregon' });

    const res = await request(app).get('/api/lead-discovery');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(res.body.data.map((job: { id: string }) => job.id)).toEqual([
      second.body.data.id,
      first.body.data.id,
    ]);
  });
});
