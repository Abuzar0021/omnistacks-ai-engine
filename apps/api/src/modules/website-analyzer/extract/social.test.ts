import { describe, expect, it } from 'vitest';
import { extractSocialLinks } from './social.js';

describe('extractSocialLinks', () => {
  it('identifies known social platforms by hostname', () => {
    const hrefs = [
      'https://www.facebook.com/acme',
      'https://x.com/acme',
      'https://instagram.com/acme',
      'https://www.linkedin.com/company/acme',
      'https://youtu.be/abc123',
      'https://acme.com/about',
    ];

    expect(extractSocialLinks(hrefs)).toEqual([
      { platform: 'FACEBOOK', url: 'https://www.facebook.com/acme' },
      { platform: 'TWITTER', url: 'https://x.com/acme' },
      { platform: 'INSTAGRAM', url: 'https://instagram.com/acme' },
      { platform: 'LINKEDIN', url: 'https://www.linkedin.com/company/acme' },
      { platform: 'YOUTUBE', url: 'https://youtu.be/abc123' },
    ]);
  });

  it('ignores invalid URLs and non-social links', () => {
    expect(extractSocialLinks(['not a url', 'https://acme.com'])).toEqual([]);
  });

  it('deduplicates identical URLs', () => {
    const hrefs = ['https://facebook.com/acme', 'https://facebook.com/acme'];
    expect(extractSocialLinks(hrefs)).toEqual([
      { platform: 'FACEBOOK', url: 'https://facebook.com/acme' },
    ]);
  });

  it('returns an empty array for no input', () => {
    expect(extractSocialLinks([])).toEqual([]);
  });
});
