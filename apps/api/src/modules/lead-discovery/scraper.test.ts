import { describe, expect, it } from 'vitest';
import { parseOutboundWebsite } from './scraper.js';

describe('parseOutboundWebsite', () => {
  it('extracts the target URL from a biz_redir link', () => {
    const href =
      '/biz_redir?url=https%3A%2F%2Fwww.acme-saloon.com%2F&website_link_type=biz_website';
    expect(parseOutboundWebsite(href, 'https://www.yelp.com')).toBe('https://www.acme-saloon.com/');
  });

  it('resolves a relative biz_redir link against the base URL', () => {
    const href = '/biz_redir?url=https%3A%2F%2Fexample.com%2F';
    expect(parseOutboundWebsite(href, 'https://www.yelp.com')).toBe('https://example.com/');
  });

  it('returns null when there is no href', () => {
    expect(parseOutboundWebsite(null, 'https://www.yelp.com')).toBeNull();
  });

  it('returns null when the href has no url query param', () => {
    expect(
      parseOutboundWebsite('/biz_redir?website_link_type=biz_website', 'https://www.yelp.com'),
    ).toBeNull();
  });

  it('returns null for a malformed href that fails to parse', () => {
    expect(parseOutboundWebsite('http://[not-valid', 'https://www.yelp.com')).toBeNull();
  });
});
