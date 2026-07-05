import { describe, expect, it } from 'vitest';
import { extractCity, mapPlaceResult } from './places-client.js';

describe('extractCity', () => {
  it('returns the locality component text', () => {
    expect(
      extractCity([
        { longText: 'Texas', types: ['administrative_area_level_1'] },
        { longText: 'Austin', types: ['locality', 'political'] },
        { longText: 'USA', types: ['country'] },
      ]),
    ).toBe('Austin');
  });

  it('returns null when there is no locality component', () => {
    expect(extractCity([{ longText: 'Texas', types: ['administrative_area_level_1'] }])).toBeNull();
  });

  it('returns null when components are undefined', () => {
    expect(extractCity(undefined)).toBeNull();
  });
});

describe('mapPlaceResult', () => {
  it('maps a full Places API result', () => {
    expect(
      mapPlaceResult({
        displayName: { text: 'Acme Saloon' },
        websiteUri: 'https://acme-saloon.com/',
        internationalPhoneNumber: '+1 512-555-0100',
        addressComponents: [{ longText: 'Austin', types: ['locality'] }],
      }),
    ).toEqual({
      name: 'Acme Saloon',
      website: 'https://acme-saloon.com/',
      phone: '+1 512-555-0100',
      city: 'Austin',
    });
  });

  it('fills in nulls for missing optional fields', () => {
    expect(mapPlaceResult({ displayName: { text: 'No Website Co' } })).toEqual({
      name: 'No Website Co',
      website: null,
      phone: null,
      city: null,
    });
  });

  it('defaults name to an empty string when displayName is missing', () => {
    expect(mapPlaceResult({}).name).toBe('');
  });
});
