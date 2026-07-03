export type SocialPlatform =
  'FACEBOOK' | 'TWITTER' | 'INSTAGRAM' | 'LINKEDIN' | 'YOUTUBE' | 'TIKTOK' | 'PINTEREST';

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

const PLATFORM_HOSTNAMES: Array<[SocialPlatform, string[]]> = [
  ['FACEBOOK', ['facebook.com', 'fb.com']],
  ['TWITTER', ['twitter.com', 'x.com']],
  ['INSTAGRAM', ['instagram.com']],
  ['LINKEDIN', ['linkedin.com']],
  ['YOUTUBE', ['youtube.com', 'youtu.be']],
  ['TIKTOK', ['tiktok.com']],
  ['PINTEREST', ['pinterest.com']],
];

/** Finds known social-media profile/page links among a set of hrefs. */
export function extractSocialLinks(hrefs: string[]): SocialLink[] {
  const seen = new Set<string>();
  const result: SocialLink[] = [];

  for (const href of hrefs) {
    let hostname: string;
    try {
      hostname = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      continue;
    }

    const platform = PLATFORM_HOSTNAMES.find(([, hosts]) => hosts.includes(hostname))?.[0];
    if (platform && !seen.has(href)) {
      seen.add(href);
      result.push({ platform, url: href });
    }
  }

  return result;
}
