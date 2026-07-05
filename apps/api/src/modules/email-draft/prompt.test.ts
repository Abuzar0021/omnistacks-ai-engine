import type { BusinessAudit } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  assembleEmailBody,
  buildEmailPrompt,
  buildRetryMessage,
  emailResponseSchema,
  summarizeAuditForPrompt,
} from './prompt.js';

function audit(overrides: Partial<BusinessAudit> = {}): BusinessAudit {
  return {
    id: 'audit_1',
    businessId: 'biz_1',
    websiteAnalysisId: 'wa_1',
    status: 'COMPLETED',
    promptVersion: 'business-audit-v1',
    model: 'anthropic/claude-sonnet-4.5',
    summary: 'Outdated site, strong opportunity.',
    findings: [{ category: 'seo', severity: 'high', description: 'No meta description.' }],
    score: 82,
    confidence: 'high',
    reasons: ['No SEO metadata', 'No mobile-friendly design'],
    disqualifiers: [],
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    durationMs: 1000,
    error: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('summarizeAuditForPrompt', () => {
  it('trims the audit to summary/score/reasons', () => {
    const summary = summarizeAuditForPrompt(audit());
    expect(summary).toEqual({
      summary: 'Outdated site, strong opportunity.',
      score: 82,
      reasons: ['No SEO metadata', 'No mobile-friendly design'],
    });
  });

  it('defaults reasons to an empty array when null', () => {
    const summary = summarizeAuditForPrompt(audit({ reasons: null }));
    expect(summary.reasons).toEqual([]);
  });
});

describe('buildEmailPrompt', () => {
  it('includes business context, business, audit summary, and tone', () => {
    const messages = buildEmailPrompt({
      businessContext: 'We help small businesses.',
      business: { name: 'Acme', industry: 'Retail', country: 'USA', city: 'NYC' },
      audit: audit(),
      tone: 'professional',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.content).toContain('We help small businesses.');
    expect(messages[1]?.content).toContain('Acme');
    expect(messages[1]?.content).toContain('Outdated site, strong opportunity.');
    expect(messages[1]?.content).toContain('Tone: professional');
  });
});

describe('buildRetryMessage', () => {
  it('references the validation error', () => {
    const message = buildRetryMessage('subject: too long');
    expect(message.role).toBe('user');
    expect(message.content).toContain('subject: too long');
  });
});

describe('assembleEmailBody', () => {
  it('substitutes opener and sender name placeholders', () => {
    const body = assembleEmailBody('Hi,\n\n{{opener}}\n\nBest,\n{{senderName}}', {
      opener: 'I noticed your site has no mobile nav.',
      senderName: 'The OmniStacks Team',
    });
    expect(body).toBe(
      'Hi,\n\nI noticed your site has no mobile nav.\n\nBest,\nThe OmniStacks Team',
    );
  });
});

describe('emailResponseSchema', () => {
  it('accepts a valid response without factUsed', () => {
    const result = emailResponseSchema.safeParse({
      subject: 'Quick question about your site',
      opener: 'I noticed your homepage has no contact form.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid response with factUsed', () => {
    const result = emailResponseSchema.safeParse({
      subject: 'Quick question',
      opener: 'Saw your blog has not been updated recently.',
      factUsed: 'Blog last updated 2 years ago',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a subject over 80 characters', () => {
    const result = emailResponseSchema.safeParse({
      subject: 'x'.repeat(81),
      opener: 'Short opener.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown properties', () => {
    const result = emailResponseSchema.safeParse({
      subject: 'Quick question',
      opener: 'Short opener.',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing opener', () => {
    const result = emailResponseSchema.safeParse({ subject: 'Quick question' });
    expect(result.success).toBe(false);
  });
});
