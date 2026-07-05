import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface ScrapedBusiness {
  name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
}

export interface SearchOptions {
  industry: string;
  location: string;
  limit: number;
  /** Overrides env.GOOGLE_PLACES_BASE_URL — tests point this at a local fixture server. */
  baseUrl?: string;
}

interface PlacesAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlacesResult {
  displayName?: { text?: string };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  addressComponents?: PlacesAddressComponent[];
}

interface PlacesSearchResponse {
  places?: PlacesResult[];
}

const FIELD_MASK =
  'places.displayName,places.websiteUri,places.internationalPhoneNumber,places.addressComponents';

/**
 * Pulls the city out of Places API's structured address components (the
 * "locality" component) rather than string-parsing the formatted address,
 * which varies too much by country to parse reliably. Pure and
 * network-independent so it's unit-testable on its own.
 */
export function extractCity(components: PlacesAddressComponent[] | undefined): string | null {
  if (!components) return null;
  const locality = components.find((component) => component.types?.includes('locality'));
  return locality?.longText ?? null;
}

/** Maps one Places API result to our internal shape. Pure, unit-testable. */
export function mapPlaceResult(place: PlacesResult): ScrapedBusiness {
  return {
    name: place.displayName?.text ?? '',
    website: place.websiteUri ?? null,
    phone: place.internationalPhoneNumber ?? null,
    city: extractCity(place.addressComponents),
  };
}

/**
 * Searches Google Places (Text Search, the current "Places API (New)")
 * for businesses matching an industry + location query. Requires
 * GOOGLE_PLACES_API_KEY (see docs/DEPLOYMENT.md) — billed per request past
 * Google's monthly free credit; check current pricing before relying on
 * this at volume. Chosen over scraping a directory site specifically to
 * avoid the bot-detection unreliability that approach hit in production
 * (see docs/ARCHITECTURE.md's lead-discovery scope-boundary note).
 */
export async function searchBusinesses(options: SearchOptions): Promise<ScrapedBusiness[]> {
  const baseUrl = (options.baseUrl ?? env.GOOGLE_PLACES_BASE_URL).replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/v1/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${options.industry} in ${options.location}` }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Places search failed: ${response.status} ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as PlacesSearchResponse;
  const places = data.places ?? [];

  if (places.length === 0) {
    logger.warn(
      { industry: options.industry, location: options.location },
      'lead discovery: Google Places returned zero results',
    );
  }

  return places
    .slice(0, options.limit)
    .map(mapPlaceResult)
    .filter((business) => business.name !== '');
}
