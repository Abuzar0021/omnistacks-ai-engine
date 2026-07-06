import { execFileSync } from 'node:child_process';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A "kitchen sink" fixture page exercising every capture category the
 * website analyzer collects. Kept intentionally in one place so the
 * integration test's assertions have a single source of truth to match.
 */
export const FIXTURE_HTML = `<!doctype html>
<html lang="en" ng-version="17.0.0">
<head>
  <meta charset="utf-8" />
  <title>Acme Test Fixture</title>
  <meta name="description" content="A fixture page for the website analyzer." />
  <link rel="canonical" href="/" />
  <link rel="icon" href="/favicon.ico" />
  <meta name="generator" content="Acme CMS" />
  <meta property="og:title" content="Acme Test Fixture" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
  <script src="/wp-content/themes/acme/app.js"></script>
  <script>window.dataLayer = window.dataLayer || []; window.gtag = function(){ window.dataLayer.push(arguments); };</script>
</head>
<body data-reactroot="">
  <nav>
    <a href="/">Home</a>
    <a href="/pricing">Pricing</a>
    <a href="https://partner.example.com">Partner</a>
  </nav>
  <main>
    <h1>Welcome to Acme</h1>
    <h2>What we do</h2>
    <h3>Details</h3>
    <p>Contact us at hello@acme-fixture.test or call +1 (555) 123-4567.</p>
    <img src="/logo.png" alt="Acme logo" />
    <video src="/promo.mp4"></video>
    <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
    <form action="/contact" method="post">
      <input type="text" name="name" />
      <input type="email" name="email" />
      <textarea name="message"></textarea>
    </form>
    <a href="https://www.facebook.com/acme">Facebook</a>
    <a href="https://x.com/acme">Twitter</a>
  </main>
  <footer>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </footer>
</body>
</html>`;

const LANDED_HTML = `<!doctype html><html><head><title>Landed Page</title></head><body><h1>Landed</h1></body></html>`;

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/redirect') {
    res.writeHead(302, { Location: '/landed' });
    res.end();
    return;
  }
  if (url === '/landed') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(LANDED_HTML);
    return;
  }
  if (url === '/hang') {
    // Deliberately never responds, to exercise navigation-timeout handling.
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(FIXTURE_HTML);
}

export interface FixtureServer {
  httpBaseUrl: string;
  httpsBaseUrl: string;
  close: () => Promise<void>;
}

function generateSelfSignedCert(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), 'omnistacks-fixture-cert-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-nodes',
    '-subj',
    '/CN=127.0.0.1',
  ]);
  const key = readFileSync(keyPath, 'utf8');
  const cert = readFileSync(certPath, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return { key, cert };
}

/** Starts plain-HTTP and self-signed-HTTPS fixture servers on ephemeral ports. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const { key, cert } = generateSelfSignedCert();

  const httpServer = createHttpServer(handleRequest);
  const httpsServer = createHttpsServer({ key, cert }, handleRequest);

  const httpPort = await listen(httpServer);
  const httpsPort = await listen(httpsServer);

  return {
    httpBaseUrl: `http://127.0.0.1:${httpPort}`,
    httpsBaseUrl: `https://127.0.0.1:${httpsPort}`,
    close: async () => {
      await Promise.all([closeServer(httpServer), closeServer(httpsServer)]);
    },
  };
}

function listen(server: {
  listen: (port: number, host: string, cb: () => void) => unknown;
  address: () => unknown;
}): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      resolve(address.port);
    });
  });
}

function closeServer(server: { close: (cb: () => void) => unknown }): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
