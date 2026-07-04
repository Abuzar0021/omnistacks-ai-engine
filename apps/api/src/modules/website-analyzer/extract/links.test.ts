import { describe, expect, it } from 'vitest';
import type { AnchorInfo } from '../types.js';
import { classifyLinks } from './links.js';

function anchor(overrides: Partial<AnchorInfo> = {}): AnchorInfo {
  return { href: '', text: '', inNav: false, inFooter: false, ...overrides };
}

describe('classifyLinks', () => {
  it('classifies same-hostname links as internal and other hostnames as external', () => {
    const anchors = [
      anchor({ href: 'https://acme.com/about', text: 'About' }),
      anchor({ href: 'https://www.acme.com/contact', text: 'Contact' }),
      anchor({ href: 'https://other.com/', text: 'Other' }),
    ];

    const result = classifyLinks(anchors, 'https://acme.com/');

    expect(result.internalLinks).toEqual([
      { href: 'https://acme.com/about', text: 'About' },
      { href: 'https://www.acme.com/contact', text: 'Contact' },
    ]);
    expect(result.externalLinks).toEqual([{ href: 'https://other.com/', text: 'Other' }]);
  });

  it('collects nav/footer links independently of internal/external', () => {
    const anchors = [
      anchor({ href: 'https://acme.com/pricing', text: 'Pricing', inNav: true }),
      anchor({ href: 'https://acme.com/terms', text: 'Terms', inFooter: true }),
      anchor({ href: 'https://other.com/', text: 'Partner', inNav: true, inFooter: true }),
    ];

    const result = classifyLinks(anchors, 'https://acme.com/');

    expect(result.navigationLinks).toEqual([
      { href: 'https://acme.com/pricing', text: 'Pricing' },
      { href: 'https://other.com/', text: 'Partner' },
    ]);
    expect(result.footerLinks).toEqual([
      { href: 'https://acme.com/terms', text: 'Terms' },
      { href: 'https://other.com/', text: 'Partner' },
    ]);
  });

  it('excludes non-http(s) schemes from internal/external but keeps them in nav/footer', () => {
    const anchors = [
      anchor({ href: 'mailto:hello@acme.com', text: 'Email us', inFooter: true }),
      anchor({ href: 'tel:+15551234567', text: 'Call us', inFooter: true }),
      anchor({ href: '#section', text: 'Jump' }),
    ];

    const result = classifyLinks(anchors, 'https://acme.com/');

    expect(result.internalLinks).toEqual([]);
    expect(result.externalLinks).toEqual([]);
    expect(result.footerLinks).toHaveLength(2);
  });

  it('deduplicates repeated hrefs within a category', () => {
    const anchors = [
      anchor({ href: 'https://acme.com/about', text: 'About' }),
      anchor({ href: 'https://acme.com/about', text: 'About us' }),
    ];

    const result = classifyLinks(anchors, 'https://acme.com/');

    expect(result.internalLinks).toEqual([{ href: 'https://acme.com/about', text: 'About' }]);
  });

  it('ignores blank hrefs', () => {
    const result = classifyLinks([anchor({ href: '  ' })], 'https://acme.com/');

    expect(result.internalLinks).toEqual([]);
    expect(result.navigationLinks).toEqual([]);
  });
});
