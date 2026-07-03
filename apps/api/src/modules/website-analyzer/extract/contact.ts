const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

/** Extracts deduplicated email addresses from free text. */
export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return dedupeCaseInsensitive(matches);
}

// Heuristic, not a full ITU-E.164 parser: matches common human-formatted
// phone numbers (optional country code, grouped digits with separators).
// Requires at least one separator/parenthesis so we don't match arbitrary
// long integers (prices, years, IDs) embedded in page text.
const PHONE_REGEX = /(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?(?:[-.\s]\d{2,4}){2,4}/g;

/** Extracts deduplicated phone-number-like strings from free text. */
export function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_REGEX) ?? [];
  const plausible = matches.filter((match) => {
    const digitCount = match.replace(/\D/g, '').length;
    return digitCount >= 7 && digitCount <= 15;
  });
  return dedupeCaseInsensitive(plausible.map((match) => match.trim()));
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}
