/// <reference lib="dom" />
import type { Page } from 'playwright';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { launchBrowser } from './browser.js';

export interface ScrapedBusiness {
  name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
}

export interface ScrapeOptions {
  industry: string;
  location: string;
  limit: number;
  /** Overrides env.YELP_BASE_URL — tests point this at a local fixture server. */
  baseUrl?: string;
}

interface SearchResultLink {
  name: string;
  href: string;
}

/**
 * Runs inside the page (browser context) against a Yelp-style search
 * results page. Must not reference outer-scope variables.
 */
function extractSearchResults(): SearchResultLink[] {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/biz/"]'));
  const seen = new Set<string>();
  const results: SearchResultLink[] = [];
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    const name = anchor.textContent?.trim() ?? '';
    if (!href || !name || seen.has(href)) continue;
    seen.add(href);
    results.push({ name, href });
  }
  return results;
}

interface RawDetailFields {
  websiteHref: string | null;
  phone: string | null;
  city: string | null;
}

/**
 * Runs inside the page (browser context) against a Yelp-style business
 * detail page. Only pulls the raw `/biz_redir` href — parsing the real
 * target out of it is done Node-side (see parseOutboundWebsite) so that
 * logic is unit-testable without a browser.
 */
function extractRawDetailFields(): RawDetailFields {
  const websiteAnchor = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).find(
    (anchor) => anchor.getAttribute('href')?.includes('/biz_redir') ?? false,
  );

  return {
    websiteHref: websiteAnchor ? websiteAnchor.getAttribute('href') : null,
    phone: document.querySelector('[data-testid="biz-phone-number"]')?.textContent?.trim() || null,
    city: document.querySelector('[data-testid="biz-city"]')?.textContent?.trim() || null,
  };
}

/**
 * Extracts the real destination from a Yelp `/biz_redir?...&url=<encoded>`
 * outbound link — Yelp routes the "Business website" link through a
 * redirect rather than linking to the site directly. Pure and
 * DOM-independent so it's unit-testable without a browser.
 */
export function parseOutboundWebsite(href: string | null, baseUrl: string): string | null {
  if (!href) return null;
  try {
    const target = new URL(href, baseUrl).searchParams.get('url');
    return target ? decodeURIComponent(target) : null;
  } catch {
    return null;
  }
}

/**
 * Yelp's search results render client-side after the initial HTML loads, so
 * `domcontentloaded` alone can fire before any `/biz/...` links exist yet.
 * Waits for either the results to actually appear or the network to settle,
 * whichever comes first; never throws — a genuine zero-result page (or a
 * bot-detection page that never renders results) should complete as "found
 * nothing", not fail the job.
 */
async function waitForPageToSettle(page: Page): Promise<void> {
  await Promise.race([
    page.waitForSelector('a[href^="/biz/"]', {
      timeout: env.LEAD_DISCOVERY_NAVIGATION_TIMEOUT_MS,
    }),
    page.waitForLoadState('networkidle', { timeout: env.LEAD_DISCOVERY_NAVIGATION_TIMEOUT_MS }),
  ]).catch(() => {});
}

/**
 * Scrapes a Yelp-style directory for businesses matching an industry +
 * location query: loads the search results page, then visits each result's
 * detail page for its website/phone/city. Scraping Yelp directly is
 * fragile (their markup changes over time) and against most directories'
 * Terms of Service — this was a deliberate, disclosed tradeoff (see
 * docs/ARCHITECTURE.md's lead-discovery scope-boundary note) in exchange
 * for no per-request API cost. Detail-page failures are skipped rather than
 * failing the whole job, since directory pages are scraped one at a time.
 */
export async function scrapeBusinesses(options: ScrapeOptions): Promise<ScrapedBusiness[]> {
  const baseUrl = (options.baseUrl ?? env.YELP_BASE_URL).replace(/\/$/, '');
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({
      // A realistic desktop-browser UA — identifying as a bot gets directory
      // sites to block the request or serve a page with no results, which
      // looks identical to a genuine zero-result search.
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const searchUrl = `${baseUrl}/search?find_desc=${encodeURIComponent(options.industry)}&find_loc=${encodeURIComponent(options.location)}`;
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: env.LEAD_DISCOVERY_NAVIGATION_TIMEOUT_MS,
    });
    await waitForPageToSettle(page);
    const results = (await page.evaluate(extractSearchResults)).slice(0, options.limit);

    if (results.length === 0) {
      logger.warn(
        { industry: options.industry, location: options.location, pageTitle: await page.title() },
        'lead discovery: search page had no matching links — directory markup may have changed, or the request may have been blocked as a bot',
      );
    }

    const businesses: ScrapedBusiness[] = [];
    for (const result of results) {
      try {
        await page.goto(`${baseUrl}${result.href}`, {
          waitUntil: 'domcontentloaded',
          timeout: env.LEAD_DISCOVERY_NAVIGATION_TIMEOUT_MS,
        });
        await waitForPageToSettle(page);
        const raw = await page.evaluate(extractRawDetailFields);
        businesses.push({
          name: result.name,
          website: parseOutboundWebsite(raw.websiteHref, baseUrl),
          phone: raw.phone,
          city: raw.city,
        });
      } catch (error) {
        logger.warn(
          { href: result.href, err: error },
          'lead discovery: failed to load business detail page, skipping',
        );
      }
    }

    return businesses;
  } finally {
    await browser.close();
  }
}
