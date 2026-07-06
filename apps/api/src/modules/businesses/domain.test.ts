import { describe, expect, it } from 'vitest';
import { normalizeDomain } from './domain.js';

describe('normalizeDomain', () => {
  it.each([
    ['https://www.Acme.com/about?utm=1', 'acme.com'],
    ['http://acme.com:8080/path', 'acme.com'],
    ['acme.com', 'acme.com'],
    ['www.acme.co.uk', 'acme.co.uk'],
    ['  HTTPS://SUB.ACME.COM  ', 'sub.acme.com'],
    ['acme.com/', 'acme.com'],
    ['https://acme.com#section', 'acme.com'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it('converts unicode hostnames to punycode', () => {
    expect(normalizeDomain('münchen.de')).toBe('xn--mnchen-3ya.de');
  });

  it.each([
    ['not a url'],
    ['localhost'],
    ['https://localhost:3000'],
    ['acme'],
    ['-bad-.com'],
    ['http://'],
    [''],
    ['   '],
  ])('returns null for invalid input %s', (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });

  it('returns null for null and undefined', () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });
});
