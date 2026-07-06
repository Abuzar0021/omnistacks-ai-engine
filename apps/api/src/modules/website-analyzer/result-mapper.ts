import { extractEmails, extractPhones } from './extract/contact.js';
import { classifyLinks } from './extract/links.js';
import { extractSocialLinks } from './extract/social.js';
import { detectTechnologies } from './extract/technology.js';
import type { CaptureResult } from './types.js';

/**
 * Pure transform from a raw capture into the fields persisted on
 * WebsiteAnalysis. Kept separate from I/O (Playwright, disk, DB) so the
 * mapping logic is unit-testable with plain fixture data.
 */
export function buildAnalysisResult(capture: CaptureResult) {
  const { page } = capture;

  const links = classifyLinks(page.anchors, capture.finalUrl);
  const socialLinks = extractSocialLinks(page.anchors.map((anchor) => anchor.href));
  const emails = extractEmails(page.bodyText);
  const phones = extractPhones(page.bodyText);

  const jsonLd = page.jsonLdRaw
    .map((raw) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    })
    .filter((value): value is unknown => value !== null);

  const technologies = detectTechnologies({
    scriptSrcs: page.scriptSrcs,
    headers: capture.headers,
    generatorMeta: page.generatorMeta,
    hasWpContentAsset: page.hasWpContentAsset,
    hasShopifyGlobal: page.hasShopifyGlobal,
    hasWixGlobal: page.hasWixGlobal,
    hasSquarespaceGlobal: page.hasSquarespaceGlobal,
    hasNextData: page.hasNextData,
    hasReactDevtoolsHook: page.hasReactDevtoolsHook,
    hasReactRootAttr: page.hasReactRootAttr,
    hasVueGlobal: page.hasVueGlobal,
    ngVersion: page.ngVersion,
    hasDataLayer: page.hasDataLayer,
    hasGtagFn: page.hasGtagFn,
    hasGaFn: page.hasGaFn,
    hasFbq: page.hasFbq,
  });

  return {
    finalUrl: capture.finalUrl,
    statusCode: capture.statusCode,
    redirectCount: capture.redirectCount,
    title: page.title,
    metaDescription: page.metaDescription,
    canonicalUrl: page.canonicalUrl,
    language: page.language,
    faviconUrl: page.faviconUrl,
    headings: page.headings,
    openGraph: page.openGraph,
    twitterCard: page.twitterCard,
    jsonLd,
    internalLinks: links.internalLinks,
    externalLinks: links.externalLinks,
    navigationLinks: links.navigationLinks,
    footerLinks: links.footerLinks,
    images: page.images,
    videos: page.videos,
    contactForms: page.forms,
    emails,
    phones,
    socialLinks,
    technologies,
  };
}

export type AnalysisResultFields = ReturnType<typeof buildAnalysisResult>;
