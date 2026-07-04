import { describe, expect, it } from 'vitest';
import { extractEmails, extractPhones } from './contact.js';

describe('extractEmails', () => {
  it('extracts emails from surrounding text', () => {
    expect(extractEmails('Contact us at info@acme.com or sales@acme.com today')).toEqual([
      'info@acme.com',
      'sales@acme.com',
    ]);
  });

  it('deduplicates case-insensitively, keeping the first occurrence', () => {
    expect(extractEmails('Email: Info@Acme.com and info@acme.com')).toEqual(['Info@Acme.com']);
  });

  it('returns an empty array when no email is present', () => {
    expect(extractEmails('No contact information here.')).toEqual([]);
  });

  it('handles plus-addressing and subdomains', () => {
    expect(extractEmails('reach us: sales+leads@mail.acme.co.uk')).toEqual([
      'sales+leads@mail.acme.co.uk',
    ]);
  });
});

describe('extractPhones', () => {
  it('extracts common human-formatted phone numbers', () => {
    const text = 'Call +1 (555) 123-4567 or 555-987-6543 for support.';
    expect(extractPhones(text)).toEqual(['+1 (555) 123-4567', '555-987-6543']);
  });

  it('extracts international formats with country codes', () => {
    expect(extractPhones('UK office: +44 20 7946 0958')).toEqual(['+44 20 7946 0958']);
  });

  it('ignores plain numbers that are not phone-shaped (years, prices)', () => {
    expect(extractPhones('Founded in 2024. Price: $1999.')).toEqual([]);
  });

  it('deduplicates repeated numbers', () => {
    expect(extractPhones('Call 555-123-4567 or 555-123-4567')).toEqual(['555-123-4567']);
  });

  it('returns an empty array for text with no phone numbers', () => {
    expect(extractPhones('Nothing to see here.')).toEqual([]);
  });
});
