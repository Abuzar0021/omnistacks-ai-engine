import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/** A small server mimicking Google Places API's Text Search (New) response shape. */
const SEARCH_RESPONSE = {
  places: [
    {
      displayName: { text: 'Acme Saloon', languageCode: 'en' },
      websiteUri: 'https://www.acme-saloon.com/',
      internationalPhoneNumber: '+1 512-555-0100',
      addressComponents: [
        { longText: 'Austin', shortText: 'Austin', types: ['locality', 'political'] },
        { longText: 'Texas', shortText: 'TX', types: ['administrative_area_level_1'] },
      ],
    },
    {
      displayName: { text: 'Lone Star Bar', languageCode: 'en' },
      addressComponents: [{ longText: 'Austin', shortText: 'Austin', types: ['locality'] }],
    },
  ],
};

export type PlacesFixtureScenario = 'success' | 'empty' | 'error';

export interface PlacesFixtureServer {
  baseUrl: string;
  close: () => Promise<void>;
  getLastRequestBody: () => string | null;
  getLastApiKeyHeader: () => string | null;
}

export async function startPlacesFixtureServer(
  scenario: PlacesFixtureScenario = 'success',
): Promise<PlacesFixtureServer> {
  let lastRequestBody: string | null = null;
  let lastApiKeyHeader: string | null = null;

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.url !== '/v1/places:searchText' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }

    lastApiKeyHeader = (req.headers['x-goog-api-key'] as string) ?? null;
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      lastRequestBody = body;
      if (scenario === 'error') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'API key not valid' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scenario === 'empty' ? {} : SEARCH_RESPONSE));
    });
  }

  const server = createServer(handleRequest);
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as { port: number }).port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    getLastRequestBody: () => lastRequestBody,
    getLastApiKeyHeader: () => lastApiKeyHeader,
  };
}
