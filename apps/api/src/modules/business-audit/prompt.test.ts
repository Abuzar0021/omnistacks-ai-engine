import type { WebsiteAnalysis } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  auditResponseSchema,
  buildAuditPrompt,
  buildRetryMessage,
  summarizeAnalysisForPrompt,
} from './prompt.js';

function analysis(overrides: Partial<WebsiteAnalysis> = {}): WebsiteAnalysis {
  return {
    id: 'wa_1',
    businessId: 'biz_1',
    status: 'COMPLETED',
    requestedUrl: 'https://acme.com',
    finalUrl: 'https://acme.com/',
    statusCode: 200,
    redirectCount: 0,
    title: 'Acme Corp',
    metaDescription: 'We make widgets',
    canonicalUrl: null,
    language: 'en',
    faviconUrl: null,
    headings: { h1: ['Welcome'], h2: ['About', 'Contact'], h3: [], h4: [], h5: [], h6: [] },
    openGraph: null,
    twitterCard: null,
    jsonLd: null,
    internalLinks: [{ href: 'https://acme.com/about', text: 'About' }],
    externalLinks: [],
    navigationLinks: null,
    footerLinks: null,
    images: null,
    videos: null,
    contactForms: [{ action: '/contact', method: 'post', fieldCount: 2, fieldNames: [] }],
    emails: ['hello@acme.com'],
    phones: [],
    socialLinks: [{ platform: 'FACEBOOK', url: 'https://facebook.com/acme' }],
    technologies: ['WORDPRESS'],
    screenshotPath: 'wa_1.png',
    screenshotWidth: 1280,
    screenshotHeight: 2000,
    screenshotByteSize: 12345,
    screenshotMimeType: 'image/png',
    durationMs: 1500,
    error: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('summarizeAnalysisForPrompt', () => {
  it('extracts only the fields the prompt needs', () => {
    const summary = summarizeAnalysisForPrompt(analysis());

    expect(summary).toEqual({
      title: 'Acme Corp',
      metaDescription: 'We make widgets',
      headings: { h1: ['Welcome'], h2: ['About', 'Contact'] },
      technologies: ['WORDPRESS'],
      internalLinkCount: 1,
      externalLinkCount: 0,
      hasContactForm: true,
      hasEmail: true,
      hasPhone: false,
      hasSocialLinks: true,
    });
  });

  it('defaults gracefully when JSON fields are null', () => {
    const summary = summarizeAnalysisForPrompt(
      analysis({
        headings: null,
        technologies: null,
        internalLinks: null,
        externalLinks: null,
        contactForms: null,
        emails: null,
        phones: null,
        socialLinks: null,
      }),
    );

    expect(summary).toEqual({
      title: 'Acme Corp',
      metaDescription: 'We make widgets',
      headings: { h1: [], h2: [] },
      technologies: [],
      internalLinkCount: 0,
      externalLinkCount: 0,
      hasContactForm: false,
      hasEmail: false,
      hasPhone: false,
      hasSocialLinks: false,
    });
  });
});

describe('buildAuditPrompt', () => {
  it('includes the business context, business fields, and analysis summary', () => {
    const messages = buildAuditPrompt({
      businessContext: 'We help small businesses with SEO.',
      business: { name: 'Acme', industry: 'Retail', country: 'USA', city: 'NYC' },
      analysis: analysis(),
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toContain('We help small businesses with SEO.');
    expect(messages[1]?.content).toContain('"name":"Acme"');
    expect(messages[1]?.content).toContain('"title":"Acme Corp"');
  });
});

describe('buildRetryMessage', () => {
  it('is a user message that includes the validation error', () => {
    const message = buildRetryMessage('score: expected number, received string');

    expect(message.role).toBe('user');
    expect(message.content).toContain('score: expected number, received string');
  });
});

describe('auditResponseSchema', () => {
  const valid = {
    summary: 'Decent site but outdated design.',
    findings: [{ category: 'design', severity: 'medium', description: 'No mobile layout.' }],
    score: 72,
    confidence: 'high',
    reasons: ['Missing mobile-friendly design', 'No blog or content marketing'],
  };

  it('accepts a valid response, defaulting disqualifiers to absent', () => {
    const result = auditResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts an explicit disqualifiers array', () => {
    const result = auditResponseSchema.safeParse({ ...valid, disqualifiers: ['Wrong geography'] });
    expect(result.success).toBe(true);
  });

  it('rejects a score outside 0-100', () => {
    expect(auditResponseSchema.safeParse({ ...valid, score: 150 }).success).toBe(false);
    expect(auditResponseSchema.safeParse({ ...valid, score: -1 }).success).toBe(false);
  });

  it('rejects an unknown finding category', () => {
    const result = auditResponseSchema.safeParse({
      ...valid,
      findings: [{ category: 'astrology', severity: 'medium', description: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty reasons array', () => {
    expect(auditResponseSchema.safeParse({ ...valid, reasons: [] }).success).toBe(false);
  });

  it('rejects unknown top-level properties', () => {
    expect(auditResponseSchema.safeParse({ ...valid, extra: 'nope' }).success).toBe(false);
  });
});
