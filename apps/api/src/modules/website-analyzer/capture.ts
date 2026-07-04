/// <reference lib="dom" />
import type { Request } from 'playwright';
import { errors as playwrightErrors } from 'playwright';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { launchBrowser } from './browser.js';
import type { CaptureResult, NavigationErrorCategory, PageExtract } from './types.js';
import { NavigationError } from './types.js';

/**
 * Runs entirely inside the page (browser context) — must not reference any
 * outer-scope variables, only DOM/window APIs. Playwright serializes this
 * function and executes it in the page.
 */
function extractPageData(): PageExtract {
  const queryAll = (selector: string, root: ParentNode = document): Element[] =>
    Array.from(root.querySelectorAll(selector));

  const getMetaContent = (selector: string): string | null =>
    document.querySelector(selector)?.getAttribute('content') ?? null;

  const headings = {
    h1: queryAll('h1')
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
    h2: queryAll('h2')
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
    h3: queryAll('h3')
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
    h4: queryAll('h4')
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
    h5: queryAll('h5')
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
    h6: queryAll('h6')
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
  };

  const openGraph: Record<string, string> = {};
  for (const el of queryAll('meta[property^="og:"]')) {
    const prop = el.getAttribute('property');
    const content = el.getAttribute('content');
    if (prop && content) openGraph[prop] = content;
  }

  const twitterCard: Record<string, string> = {};
  for (const el of queryAll('meta[name^="twitter:"]')) {
    const name = el.getAttribute('name');
    const content = el.getAttribute('content');
    if (name && content) twitterCard[name] = content;
  }

  const jsonLdRaw = queryAll('script[type="application/ld+json"]').map(
    (el) => el.textContent ?? '',
  );

  const anchors = queryAll('a[href]').map((el) => {
    const anchor = el as HTMLAnchorElement;
    return {
      href: anchor.href,
      text: (anchor.textContent ?? '').trim().slice(0, 200),
      inNav: anchor.closest('nav') !== null,
      inFooter: anchor.closest('footer') !== null,
    };
  });

  const images = queryAll('img')
    .map((el) => {
      const img = el as HTMLImageElement;
      return { src: img.currentSrc || img.src || '', alt: img.getAttribute('alt') ?? '' };
    })
    .filter((img) => img.src);

  const videos = [
    ...queryAll('video').map((el) => {
      const video = el as HTMLVideoElement;
      return { src: video.currentSrc || video.getAttribute('src') || '', type: 'video' as const };
    }),
    ...queryAll('video source').map((el) => ({
      src: el.getAttribute('src') || '',
      type: 'video' as const,
    })),
    ...queryAll('iframe')
      .map((el) => (el as HTMLIFrameElement).src || '')
      .filter((src) => /youtube\.com|youtu\.be|vimeo\.com/i.test(src))
      .map((src) => ({ src, type: 'embed' as const })),
  ].filter((video) => video.src);

  const forms = queryAll('form').map((el) => {
    const form = el as HTMLFormElement;
    const fields = queryAll('input, textarea, select', form);
    return {
      action: form.getAttribute('action') ?? '',
      method: (form.getAttribute('method') || 'get').toLowerCase(),
      fieldCount: fields.length,
      fieldNames: fields.map((field) => field.getAttribute('name') ?? '').filter(Boolean),
    };
  });

  const faviconLink =
    document.querySelector('link[rel="icon"]') ??
    document.querySelector('link[rel="shortcut icon"]') ??
    document.querySelector('link[rel="apple-touch-icon"]');
  const faviconUrl = faviconLink
    ? (faviconLink as HTMLLinkElement).href
    : new URL('/favicon.ico', location.origin).href;

  const w = window as unknown as {
    Shopify?: unknown;
    wixBiSession?: unknown;
    wixEmbedsAPI?: unknown;
    Squarespace?: unknown;
    Static?: { SQUARESPACE_CONTEXT?: unknown };
    __NEXT_DATA__?: unknown;
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
    __VUE__?: unknown;
    Vue?: unknown;
    dataLayer?: unknown;
    gtag?: unknown;
    ga?: unknown;
    fbq?: unknown;
  };

  return {
    title: document.title || null,
    metaDescription: getMetaContent('meta[name="description"]'),
    canonicalUrl:
      (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? null,
    language: document.documentElement.lang || null,
    faviconUrl,
    headings,
    openGraph,
    twitterCard,
    jsonLdRaw,
    anchors,
    images,
    videos,
    forms,
    bodyText: (document.body?.innerText ?? '').slice(0, 200_000),
    scriptSrcs: queryAll('script[src]').map((el) => (el as HTMLScriptElement).src),
    generatorMeta: getMetaContent('meta[name="generator"]'),
    hasWpContentAsset:
      queryAll(
        'link[href*="/wp-content/"], script[src*="/wp-content/"], link[href*="/wp-includes/"], script[src*="/wp-includes/"]',
      ).length > 0,
    hasShopifyGlobal: Boolean(w.Shopify),
    hasWixGlobal: Boolean(w.wixBiSession || w.wixEmbedsAPI),
    hasSquarespaceGlobal: Boolean(w.Squarespace || w.Static?.SQUARESPACE_CONTEXT),
    hasNextData: document.getElementById('__NEXT_DATA__') !== null || Boolean(w.__NEXT_DATA__),
    hasReactDevtoolsHook: Boolean(w.__REACT_DEVTOOLS_GLOBAL_HOOK__),
    hasReactRootAttr: document.querySelector('[data-reactroot]') !== null,
    hasVueGlobal: Boolean(w.__VUE__ || w.Vue || document.querySelector('[data-v-app]')),
    ngVersion: document.querySelector('[ng-version]')?.getAttribute('ng-version') ?? null,
    hasDataLayer: Array.isArray(w.dataLayer),
    hasGtagFn: typeof w.gtag === 'function',
    hasGaFn: typeof w.ga === 'function',
    hasFbq: typeof w.fbq === 'function',
  };
}

function countRedirects(request: Request | null): number {
  let count = 0;
  let current = request;
  while (current?.redirectedFrom()) {
    count += 1;
    current = current.redirectedFrom();
  }
  return count;
}

function classifyNavigationError(error: unknown): NavigationError {
  if (error instanceof playwrightErrors.TimeoutError) {
    return new NavigationError('TIMEOUT', error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/ERR_CERT_|SSL|certificate/i.test(message)) {
    return new NavigationError('SSL', message);
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE/i.test(message)) {
    return new NavigationError('DNS', message);
  }
  return new NavigationError('UNKNOWN', message);
}

/**
 * Launches a browser, navigates to the URL, waits for the page to settle,
 * and captures all structured data plus a full-page screenshot.
 * Callers are responsible for interpreting/persisting the result.
 */
export async function captureWebsite(url: string): Promise<CaptureResult> {
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (compatible; OmniStacksWebsiteAnalyzer/1.0; +https://omnistacks.ai)',
    });
    const page = await context.newPage();

    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: env.ANALYSIS_NAVIGATION_TIMEOUT_MS,
      });
    } catch (cause) {
      throw classifyNavigationError(cause);
    }

    if (!response) {
      throw new NavigationError('UNKNOWN', 'Navigation produced no response');
    }

    // Best-effort: let network activity settle, but a page that never goes
    // idle (analytics beacons, long polling) must not fail the analysis.
    await page
      .waitForLoadState('networkidle', { timeout: env.ANALYSIS_STABLE_TIMEOUT_MS })
      .catch(() => {
        logger.debug({ url }, 'page did not reach networkidle before the stability timeout');
      });

    const finalUrl = page.url();
    const redirectCount = countRedirects(response.request());
    const headers = response.headers();
    const statusCode = response.status();

    const pageData = await page.evaluate(extractPageData);
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });

    return {
      requestedUrl: url,
      finalUrl,
      statusCode,
      redirectCount,
      headers,
      page: pageData,
      screenshot,
    };
  } finally {
    await browser.close();
  }
}
