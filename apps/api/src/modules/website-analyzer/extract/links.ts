import type { AnchorInfo } from '../types.js';

export interface LinkRef {
  href: string;
  text: string;
}

export interface ClassifiedLinks {
  internalLinks: LinkRef[];
  externalLinks: LinkRef[];
  navigationLinks: LinkRef[];
  footerLinks: LinkRef[];
}

/**
 * Classifies anchors captured from the page. Internal/external describe the
 * link's destination (only meaningful for http/https hrefs); navigation/footer
 * describe where on the page the link was found. These are independent
 * dimensions — a link can appear in multiple output arrays.
 */
export function classifyLinks(anchors: AnchorInfo[], baseUrl: string): ClassifiedLinks {
  const baseHostname = safeHostname(baseUrl);

  const internalLinks: LinkRef[] = [];
  const externalLinks: LinkRef[] = [];
  const navigationLinks: LinkRef[] = [];
  const footerLinks: LinkRef[] = [];

  const seen = {
    internal: new Set<string>(),
    external: new Set<string>(),
    nav: new Set<string>(),
    footer: new Set<string>(),
  };

  for (const anchor of anchors) {
    const href = anchor.href.trim();
    if (!href) continue;
    const ref: LinkRef = { href, text: anchor.text };

    if (anchor.inNav && !seen.nav.has(href)) {
      seen.nav.add(href);
      navigationLinks.push(ref);
    }
    if (anchor.inFooter && !seen.footer.has(href)) {
      seen.footer.add(href);
      footerLinks.push(ref);
    }

    if (!href.startsWith('http://') && !href.startsWith('https://')) continue;
    const hostname = safeHostname(href);
    if (!hostname || !baseHostname) continue;

    if (hostname === baseHostname) {
      if (!seen.internal.has(href)) {
        seen.internal.add(href);
        internalLinks.push(ref);
      }
    } else if (!seen.external.has(href)) {
      seen.external.add(href);
      externalLinks.push(ref);
    }
  }

  return { internalLinks, externalLinks, navigationLinks, footerLinks };
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
