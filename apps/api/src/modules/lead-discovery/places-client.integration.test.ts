import { afterEach, describe, expect, it } from 'vitest';
import { searchBusinesses } from './places-client.js';
import {
  startPlacesFixtureServer,
  type PlacesFixtureServer,
} from './test-support/places-fixture-server.js';

let fixture: PlacesFixtureServer | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('searchBusinesses against a Places-API-shaped fixture', () => {
  it('maps results and sends the query, API key, and field mask correctly', async () => {
    fixture = await startPlacesFixtureServer('success');

    const results = await searchBusinesses({
      industry: 'Saloons',
      location: 'Texas',
      limit: 10,
      baseUrl: fixture.baseUrl,
    });

    expect(results).toEqual([
      {
        name: 'Acme Saloon',
        website: 'https://www.acme-saloon.com/',
        phone: '+1 512-555-0100',
        city: 'Austin',
      },
      { name: 'Lone Star Bar', website: null, phone: null, city: 'Austin' },
    ]);

    expect(JSON.parse(fixture.getLastRequestBody() ?? '{}')).toEqual({
      textQuery: 'Saloons in Texas',
    });
    expect(fixture.getLastApiKeyHeader()).toBeTruthy();
  });

  it('respects the limit', async () => {
    fixture = await startPlacesFixtureServer('success');

    const results = await searchBusinesses({
      industry: 'Saloons',
      location: 'Texas',
      limit: 1,
      baseUrl: fixture.baseUrl,
    });

    expect(results).toHaveLength(1);
  });

  it('returns an empty array when Places returns no places', async () => {
    fixture = await startPlacesFixtureServer('empty');

    const results = await searchBusinesses({
      industry: 'Saloons',
      location: 'Nowhere',
      limit: 10,
      baseUrl: fixture.baseUrl,
    });

    expect(results).toEqual([]);
  });

  it('throws with the status and body when Places returns an error', async () => {
    fixture = await startPlacesFixtureServer('error');

    await expect(
      searchBusinesses({
        industry: 'Saloons',
        location: 'Texas',
        limit: 10,
        baseUrl: fixture.baseUrl,
      }),
    ).rejects.toThrow(/403/);
  });
});
