import type { TechnologySignals } from '../types.js';

export const TECHNOLOGIES = [
  'WORDPRESS',
  'SHOPIFY',
  'WIX',
  'SQUARESPACE',
  'REACT',
  'NEXT_JS',
  'ANGULAR',
  'VUE',
  'GOOGLE_ANALYTICS',
  'GOOGLE_TAG_MANAGER',
  'CLOUDFLARE',
  'FACEBOOK_PIXEL',
] as const;

export type Technology = (typeof TECHNOLOGIES)[number];

/**
 * Best-effort technology detection from signals gathered during capture
 * (in-browser DOM/window checks, script sources, and response headers).
 * Heuristic by nature — false negatives are expected for heavily customized
 * sites; false positives are minimized by requiring specific signatures.
 */
export function detectTechnologies(signals: TechnologySignals): Technology[] {
  const generator = signals.generatorMeta?.toLowerCase() ?? '';
  const scripts = signals.scriptSrcs.map((src) => src.toLowerCase());
  const headers = Object.fromEntries(
    Object.entries(signals.headers).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]),
  );
  const includesScript = (needle: string) => scripts.some((src) => src.includes(needle));

  const detected = new Set<Technology>();

  if (signals.hasWpContentAsset || generator.includes('wordpress')) {
    detected.add('WORDPRESS');
  }
  if (
    signals.hasShopifyGlobal ||
    generator.includes('shopify') ||
    includesScript('cdn.shopify.com')
  ) {
    detected.add('SHOPIFY');
  }
  if (signals.hasWixGlobal || generator.includes('wix') || includesScript('static.wixstatic.com')) {
    detected.add('WIX');
  }
  if (
    signals.hasSquarespaceGlobal ||
    generator.includes('squarespace') ||
    includesScript('squarespace.com')
  ) {
    detected.add('SQUARESPACE');
  }

  const isNext = signals.hasNextData || includesScript('/_next/');
  if (isNext) detected.add('NEXT_JS');
  if (isNext || signals.hasReactDevtoolsHook || signals.hasReactRootAttr) {
    detected.add('REACT');
  }
  if (signals.ngVersion !== null) detected.add('ANGULAR');
  if (signals.hasVueGlobal) detected.add('VUE');

  if (
    signals.hasGtagFn ||
    signals.hasGaFn ||
    includesScript('google-analytics.com') ||
    includesScript('googletagmanager.com/gtag/js')
  ) {
    detected.add('GOOGLE_ANALYTICS');
  }
  if (signals.hasDataLayer || includesScript('googletagmanager.com/gtm.js')) {
    detected.add('GOOGLE_TAG_MANAGER');
  }
  if ((headers['server'] ?? '').includes('cloudflare') || 'cf-ray' in headers) {
    detected.add('CLOUDFLARE');
  }
  if (signals.hasFbq || includesScript('connect.facebook.net')) {
    detected.add('FACEBOOK_PIXEL');
  }

  return TECHNOLOGIES.filter((tech) => detected.has(tech));
}
