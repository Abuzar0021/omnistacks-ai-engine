const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Normalizes a website URL (or bare domain) to a canonical domain:
 * lowercase hostname without protocol, credentials, port, path, or a
 * leading "www.". Returns null when no valid domain can be derived.
 *
 * The normalized domain is the duplicate-prevention key for businesses
 * (unique constraint on businesses.domain).
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;

  let raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) {
    raw = `https://${raw}`;
  }

  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    return null;
  }

  hostname = hostname.replace(/^www\./, '');

  // Require a dotted, DNS-shaped hostname (rejects "localhost", raw IPs pass
  // the shape check but are meaningless here and simply never collide).
  if (!HOSTNAME_PATTERN.test(hostname)) return null;

  return hostname;
}
