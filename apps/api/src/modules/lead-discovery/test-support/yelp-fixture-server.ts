import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * A small server mimicking the two Yelp page shapes the scraper depends on:
 * a search-results page with `/biz/<slug>` links, and per-business detail
 * pages exposing an outbound `/biz_redir` website link plus phone/city. Real
 * Yelp markup will drift from this over time — see scraper.ts's module doc.
 */
const SEARCH_HTML = `<!doctype html>
<html><body>
  <div class="businessName"><a href="/biz/acme-saloon">Acme Saloon</a></div>
  <div class="businessName"><a href="/biz/lone-star-bar">Lone Star Bar</a></div>
  <div class="businessName"><a href="/biz/broken-page-bar">Broken Page Bar</a></div>
  <a href="/biz/acme-saloon">Acme Saloon</a>
  <a href="/ad_redir?campaign=1">Sponsored</a>
</body></html>`;

const ACME_HTML = `<!doctype html>
<html><body>
  <a href="/biz_redir?url=https%3A%2F%2Fwww.acme-saloon.com%2F&website_link_type=biz_website">Business website</a>
  <p data-testid="biz-phone-number">(512) 555-0100</p>
  <span data-testid="biz-city">Austin, TX</span>
</body></html>`;

const LONE_STAR_HTML = `<!doctype html>
<html><body>
  <a href="/biz_redir?url=https%3A%2F%2Flonestarbar.com%2F&website_link_type=biz_website">Business website</a>
  <span data-testid="biz-city">Austin, TX</span>
</body></html>`;

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  if (url.startsWith('/search')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SEARCH_HTML);
    return;
  }
  if (url === '/biz/acme-saloon') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(ACME_HTML);
    return;
  }
  if (url === '/biz/lone-star-bar') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(LONE_STAR_HTML);
    return;
  }
  if (url === '/biz/broken-page-bar') {
    // Deliberately never responds, to exercise the per-result skip-on-failure path.
    return;
  }
  res.writeHead(404);
  res.end();
}

export interface YelpFixtureServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startYelpFixtureServer(): Promise<YelpFixtureServer> {
  const server = createServer(handleRequest);
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as { port: number }).port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
