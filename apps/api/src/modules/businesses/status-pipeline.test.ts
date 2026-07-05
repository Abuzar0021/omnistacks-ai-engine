import { describe, expect, it } from 'vitest';
import { advanceStatus } from './status-pipeline.js';

describe('advanceStatus', () => {
  it('advances to a target strictly ahead in the pipeline', () => {
    expect(advanceStatus('EMAIL_DRAFTED', 'EMAIL_SENT')).toBe('EMAIL_SENT');
  });

  it('allows skipping stages (e.g. reply requests a meeting directly)', () => {
    expect(advanceStatus('EMAIL_SENT', 'MEETING_BOOKED')).toBe('MEETING_BOOKED');
  });

  it('is a no-op when the target equals the current status (idempotent re-delivery)', () => {
    expect(advanceStatus('EMAIL_SENT', 'EMAIL_SENT')).toBe('EMAIL_SENT');
  });

  it('never regresses to an earlier status', () => {
    expect(advanceStatus('MEETING_BOOKED', 'EMAIL_SENT')).toBe('MEETING_BOOKED');
    expect(advanceStatus('RESPONDED', 'EMAIL_DRAFTED')).toBe('RESPONDED');
  });

  it('never advances a business that has been archived', () => {
    expect(advanceStatus('ARCHIVED', 'EMAIL_SENT')).toBe('ARCHIVED');
  });

  it('never advances past CLIENT', () => {
    expect(advanceStatus('CLIENT', 'RESPONDED')).toBe('CLIENT');
  });
});
