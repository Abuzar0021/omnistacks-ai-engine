import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scrapeBusinesses } from './scraper.js';
import {
  startYelpFixtureServer,
  type YelpFixtureServer,
} from './test-support/yelp-fixture-server.js';

let fixture: YelpFixtureServer;

beforeAll(async () => {
  fixture = await startYelpFixtureServer();
});

afterAll(async () => {
  await fixture.close();
});

describe('scrapeBusinesses against a Yelp-shaped fixture', () => {
  it('scrapes search results, enriches each from its detail page, dedupes repeated links, and skips a business whose detail page never responds', async () => {
    const results = await scrapeBusinesses({
      industry: 'Saloons',
      location: 'Texas',
      limit: 10,
      baseUrl: fixture.baseUrl,
    });

    expect(results).toEqual([
      {
        name: 'Acme Saloon',
        website: 'https://www.acme-saloon.com/',
        phone: '(512) 555-0100',
        city: 'Austin, TX',
      },
      {
        name: 'Lone Star Bar',
        website: 'https://lonestarbar.com/',
        phone: null,
        city: 'Austin, TX',
      },
    ]);
  });

  it('respects the limit and only visits that many detail pages', async () => {
    const results = await scrapeBusinesses({
      industry: 'Saloons',
      location: 'Texas',
      limit: 1,
      baseUrl: fixture.baseUrl,
    });

    expect(results).toEqual([
      {
        name: 'Acme Saloon',
        website: 'https://www.acme-saloon.com/',
        phone: '(512) 555-0100',
        city: 'Austin, TX',
      },
    ]);
  });
});
