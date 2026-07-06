import { describe, expect, it } from 'vitest';
import { detectTechnologies } from './technology.js';
import type { TechnologySignals } from '../types.js';

function signals(overrides: Partial<TechnologySignals> = {}): TechnologySignals {
  return {
    scriptSrcs: [],
    headers: {},
    generatorMeta: null,
    hasWpContentAsset: false,
    hasShopifyGlobal: false,
    hasWixGlobal: false,
    hasSquarespaceGlobal: false,
    hasNextData: false,
    hasReactDevtoolsHook: false,
    hasReactRootAttr: false,
    hasVueGlobal: false,
    ngVersion: null,
    hasDataLayer: false,
    hasGtagFn: false,
    hasGaFn: false,
    hasFbq: false,
    ...overrides,
  };
}

describe('detectTechnologies', () => {
  it('detects WordPress via wp-content assets or generator meta', () => {
    expect(detectTechnologies(signals({ hasWpContentAsset: true }))).toContain('WORDPRESS');
    expect(detectTechnologies(signals({ generatorMeta: 'WordPress 6.4' }))).toContain('WORDPRESS');
  });

  it('detects Shopify via global, generator, or CDN script', () => {
    expect(detectTechnologies(signals({ hasShopifyGlobal: true }))).toContain('SHOPIFY');
    expect(
      detectTechnologies(signals({ scriptSrcs: ['https://cdn.shopify.com/s/files/1/app.js'] })),
    ).toContain('SHOPIFY');
  });

  it('detects Wix and Squarespace', () => {
    expect(detectTechnologies(signals({ hasWixGlobal: true }))).toContain('WIX');
    expect(detectTechnologies(signals({ hasSquarespaceGlobal: true }))).toContain('SQUARESPACE');
  });

  it('detects Next.js and implies React', () => {
    const detected = detectTechnologies(signals({ hasNextData: true }));
    expect(detected).toContain('NEXT_JS');
    expect(detected).toContain('REACT');
  });

  it('detects React without Next via devtools hook or root attribute', () => {
    expect(detectTechnologies(signals({ hasReactDevtoolsHook: true }))).toEqual(['REACT']);
    expect(detectTechnologies(signals({ hasReactRootAttr: true }))).toEqual(['REACT']);
  });

  it('detects Angular via ng-version and Vue via global hook', () => {
    expect(detectTechnologies(signals({ ngVersion: '17.0.0' }))).toContain('ANGULAR');
    expect(detectTechnologies(signals({ hasVueGlobal: true }))).toContain('VUE');
  });

  it('detects Google Analytics and Google Tag Manager independently', () => {
    expect(detectTechnologies(signals({ hasGtagFn: true }))).toContain('GOOGLE_ANALYTICS');
    expect(detectTechnologies(signals({ hasGaFn: true }))).toContain('GOOGLE_ANALYTICS');
    expect(detectTechnologies(signals({ hasDataLayer: true }))).toContain('GOOGLE_TAG_MANAGER');
    expect(
      detectTechnologies(signals({ scriptSrcs: ['https://www.googletagmanager.com/gtm.js?id=X'] })),
    ).toContain('GOOGLE_TAG_MANAGER');
  });

  it('detects Cloudflare via headers', () => {
    expect(detectTechnologies(signals({ headers: { server: 'cloudflare' } }))).toContain(
      'CLOUDFLARE',
    );
    expect(detectTechnologies(signals({ headers: { 'CF-RAY': 'abc123' } }))).toContain(
      'CLOUDFLARE',
    );
  });

  it('detects Facebook Pixel via global function or script', () => {
    expect(detectTechnologies(signals({ hasFbq: true }))).toContain('FACEBOOK_PIXEL');
    expect(
      detectTechnologies(
        signals({ scriptSrcs: ['https://connect.facebook.net/en_US/fbevents.js'] }),
      ),
    ).toContain('FACEBOOK_PIXEL');
  });

  it('returns an empty array when no signals match', () => {
    expect(detectTechnologies(signals())).toEqual([]);
  });

  it('returns technologies in a stable, canonical order regardless of detection order', () => {
    const detected = detectTechnologies(
      signals({ hasFbq: true, hasWpContentAsset: true, ngVersion: '17' }),
    );
    expect(detected).toEqual(['WORDPRESS', 'ANGULAR', 'FACEBOOK_PIXEL']);
  });
});
