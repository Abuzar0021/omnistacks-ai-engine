/**
 * extract.mjs — pulls REAL brand assets from the live estehindonesia.com site.
 *
 * What it does:
 *  1. Opens the site (plus subpages) in headless Chromium, waits for networkidle.
 *  2. Captures every image the pages actually request (response sniffing on
 *     content-type image/*), plus <img src>/srcset, CSS background-image URLs,
 *     and /_next/static/media/* & /images/* paths found in DOM/HTML/CSS.
 *  3. Downloads every unique image into assets/images/ preserving original
 *     filenames (favicons/images under 1KB are skipped). next/image optimizer
 *     URLs (/_next/image?url=...) are resolved to their underlying source.
 *  4. Extracts the color palette from computed styles (body/header/nav/buttons/
 *     links/footer/brand-ish classnames) AND from every loaded stylesheet
 *     (document.styleSheets + raw /_next/static/css/* files), deduped and
 *     sorted by frequency.
 *  5. Reads logo colors straight from SVG fills / dominant raster pixels —
 *     ground truth for the brand palette.
 *  6. Records real font-family values for headings and body.
 *  7. Writes assets/brand/extraction-raw.json (everything, with provenance)
 *     and assets/brand/image-manifest.json (filename, dimensions, dominant
 *     colors, source URL — descriptions get filled in by eyeballing each file).
 *
 * Usage:
 *   node scripts/extract.mjs                       # live site, all pages
 *   node scripts/extract.mjs --base http://127.0.0.1:8081 --pages /   # fixture test
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMG_DIR = join(ROOT, 'assets', 'images');
const BRAND_DIR = join(ROOT, 'assets', 'brand');
mkdirSync(IMG_DIR, { recursive: true });
mkdirSync(BRAND_DIR, { recursive: true });

// ---------------------------------------------------------------- CLI args
const args = process.argv.slice(2);
function argVal(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const BASE = argVal('--base', 'https://www.estehindonesia.com').replace(/\/$/, '');
const PAGES = argVal('--pages', '/,/corporate,/news,/partnership,/merchandise,/membership')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

// ---------------------------------------------------------------- helpers
const MIN_IMAGE_BYTES = 1024; // skip favicons/tracking pixels under 1KB

function log(...m) {
  console.log('[extract]', ...m);
}

function sha1(buf) {
  return createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

function filenameFromUrl(url) {
  try {
    const u = new URL(url);
    let base = decodeURIComponent(u.pathname.split('/').pop() || 'image');
    base = base.replace(/[^\w.\-]+/g, '_');
    if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += '.img';
    return base;
  } catch {
    return 'image_' + sha1(Buffer.from(url)) + '.img';
  }
}

function extFromContentType(ct) {
  const map = {
    'image/svg+xml': '.svg',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
  };
  return map[(ct || '').split(';')[0].trim()] || '';
}

/** Resolve a /_next/image optimizer URL to its underlying source URL. */
function resolveNextImage(url, base) {
  try {
    const u = new URL(url, base);
    if (u.pathname === '/_next/image' && u.searchParams.get('url')) {
      return new URL(u.searchParams.get('url'), base).href;
    }
  } catch {}
  return url;
}

const COLOR_RE = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi;

function normalizeColor(raw) {
  // returns {hex, alpha} or null. Handles #rgb #rrggbb #rrggbbaa rgb() rgba() hsl() hsla()
  raw = raw.trim().toLowerCase();
  let r,
    g,
    b,
    a = 1;
  let m;
  if ((m = raw.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else if ((m = raw.match(/^rgba?\(([^)]+)\)$/))) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    [r, g, b] = parts
      .slice(0, 3)
      .map((v) => (v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : parseFloat(v)));
    if (parts[3] !== undefined)
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  } else if ((m = raw.match(/^hsla?\(([^)]+)\)$/))) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]) / 360;
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if (parts[3] !== undefined)
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) {
      r = g = b = Math.round(l * 255);
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      g = Math.round(hue2rgb(p, q, h) * 255);
      b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    }
  } else {
    return null;
  }
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return { hex, alpha: Math.round(a * 100) / 100, r, g, b };
}

function isNearWhite({ r, g, b }) {
  return r > 240 && g > 240 && b > 240;
}
function isNearBlack({ r, g, b }) {
  return r < 20 && g < 20 && b < 20;
}
function isGray({ r, g, b }) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  return max - min < 12; // low chroma
}

// ---------------------------------------------------------------- main
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const proxyBypass = process.env.NO_PROXY || process.env.no_proxy || 'localhost,127.0.0.1';

const launchOpts = { headless: true };
// this environment pre-installs Chromium outside playwright's expected revision dir
if (existsSync('/opt/pw-browsers/chromium'))
  launchOpts.executablePath = '/opt/pw-browsers/chromium';
if (proxyServer && !BASE.includes('127.0.0.1') && !BASE.includes('localhost')) {
  launchOpts.proxy = { server: proxyServer, bypass: proxyBypass };
  log('using proxy', proxyServer);
}

const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

/** url -> { buffer, contentType, firstSeenOn } */
const imageResponses = new Map();
/** url -> { firstSeenOn, via } — every discovered image URL, downloaded or not */
const discovered = new Map();
/** cssUrl -> cssText */
const cssFiles = new Map();

let currentPage = BASE;

context.on('response', async (response) => {
  try {
    const ct = (response.headers()['content-type'] || '').toLowerCase();
    const url = response.url();
    if (ct.startsWith('image/')) {
      if (!imageResponses.has(url) && response.ok()) {
        const buffer = await response.body().catch(() => null);
        if (buffer) imageResponses.set(url, { buffer, contentType: ct, firstSeenOn: currentPage });
      }
    } else if (ct.includes('text/css') || url.includes('/_next/static/css/')) {
      if (!cssFiles.has(url) && response.ok()) {
        const text = await response.text().catch(() => null);
        if (text) cssFiles.set(url, text);
      }
    }
  } catch {}
});

// in-page collectors -------------------------------------------------------
const collectFromDom = () => {
  const urls = new Set();
  const add = (u) => {
    if (u && !u.startsWith('data:')) urls.add(u);
  };
  for (const img of document.querySelectorAll('img')) {
    add(img.currentSrc || img.src);
    if (img.srcset) {
      for (const part of img.srcset.split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) add(new URL(u, location.href).href);
      }
    }
  }
  for (const s of document.querySelectorAll('source[srcset]')) {
    for (const part of s.srcset.split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u) add(new URL(u, location.href).href);
    }
  }
  for (const el of document.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') {
      for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        try {
          add(new URL(m[1], location.href).href);
        } catch {}
      }
    }
  }
  // raw HTML sweep for /_next/static/media/* and /images/* paths
  const html = document.documentElement.outerHTML;
  for (const m of html.matchAll(
    /["'(]((?:https?:\/\/[^"')\s]+)?\/(?:_next\/static\/media|images)\/[^"')\s]+?\.(?:png|jpe?g|webp|gif|svg|avif|ico))["')]/gi,
  )) {
    try {
      add(new URL(m[1], location.href).href);
    } catch {}
  }
  return [...urls];
};

const collectComputedStyles = () => {
  const picks = [];
  const sel = [
    ['body', document.body],
    ['header', document.querySelector('header')],
    ['nav', document.querySelector('nav')],
    ['footer', document.querySelector('footer')],
    ['h1', document.querySelector('h1')],
    ['h2', document.querySelector('h2')],
    ['p', document.querySelector('p')],
  ];
  for (const b of document.querySelectorAll('button, [role="button"], .btn, [class*="button" i]')) {
    sel.push(['button:' + (b.className || b.tagName).toString().slice(0, 60), b]);
    if (sel.length > 40) break;
  }
  for (const a of document.querySelectorAll('a')) {
    sel.push(['link:' + (a.textContent || '').trim().slice(0, 30), a]);
    if (sel.length > 70) break;
  }
  for (const el of document.querySelectorAll(
    '[class*="brand" i], [class*="primary" i], [class*="accent" i], [class*="hero" i], [class*="cta" i], [class*="green" i], [class*="gold" i], [class*="yellow" i]',
  )) {
    sel.push(['brandclass:' + el.className.toString().slice(0, 60), el]);
    if (sel.length > 110) break;
  }
  for (const [label, el] of sel) {
    if (!el) continue;
    const cs = getComputedStyle(el);
    picks.push({
      label,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
    });
  }
  // stylesheet color sweep (same-origin rules only; CORS sheets throw)
  const sheetColors = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = rule.cssText || '';
      for (const m of text.matchAll(
        /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi,
      )) {
        sheetColors.push(m[0]);
      }
    }
  }
  const nav = document.querySelector('nav, header');
  return {
    picks,
    sheetColors,
    title: document.title,
    navLinks: nav
      ? [...nav.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), href: a.href }))
      : [],
    footerText: document.querySelector('footer')?.innerText || '',
    socialLinks: [
      ...document.querySelectorAll(
        'a[href*="instagram"], a[href*="tiktok"], a[href*="twitter"], a[href*="x.com"], a[href*="facebook"], a[href*="youtube"], a[href*="linkedin"], a[href*="wa.me"], a[href*="whatsapp"]',
      ),
    ].map((a) => a.href),
    headings: [...document.querySelectorAll('h1, h2, h3')]
      .slice(0, 30)
      .map((h) => ({ tag: h.tagName, text: h.innerText.trim().slice(0, 200) })),
    bodyText: document.body.innerText.slice(0, 8000),
  };
};

// crawl ---------------------------------------------------------------------
const pageData = [];
const page = await context.newPage();
page.on('pageerror', () => {});

for (const path of PAGES) {
  const url = BASE + path;
  currentPage = url;
  log('visiting', url);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(async (e) => {
      log('  networkidle timed out, falling back to load:', e.message.split('\n')[0]);
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    });
    // let lazy content mount, then scroll to trigger lazy-loaded images
    await page.waitForTimeout(2500);
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const step = () => {
          y += 600;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight + 600) setTimeout(step, 150);
          else {
            window.scrollTo(0, 0);
            resolve();
          }
        };
        step();
      });
    });
    await page.waitForTimeout(2000);

    const domUrls = await page.evaluate(collectFromDom);
    for (const u of domUrls) {
      const resolved = resolveNextImage(u, BASE);
      if (!discovered.has(resolved)) discovered.set(resolved, { firstSeenOn: url, via: 'dom' });
      if (resolved !== u && !discovered.has(u))
        discovered.set(u, { firstSeenOn: url, via: 'dom(next-image-variant)' });
    }
    const styles = await page.evaluate(collectComputedStyles);
    pageData.push({ url, ...styles });
  } catch (e) {
    log('  FAILED:', e.message.split('\n')[0]);
    pageData.push({ url, error: e.message.split('\n')[0] });
  }
}

// merge response-sniffed images into discovered set
for (const [u, meta] of imageResponses) {
  if (!discovered.has(u)) discovered.set(u, { firstSeenOn: meta.firstSeenOn, via: 'response' });
}

log(
  `discovered ${discovered.size} image URLs, ${imageResponses.size} sniffed responses, ${cssFiles.size} css files`,
);

// download ------------------------------------------------------------------
const manifest = [];
const savedByName = new Map(); // filename -> contentHash

for (const [url, meta] of discovered) {
  let buffer = imageResponses.get(url)?.buffer || null;
  let contentType = imageResponses.get(url)?.contentType || '';
  if (!buffer) {
    try {
      const resp = await page.request.get(url, { timeout: 30000 });
      if (!resp.ok()) {
        log('  skip (http ' + resp.status() + ')', url);
        continue;
      }
      contentType = (resp.headers()['content-type'] || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        log('  skip (not image: ' + contentType + ')', url);
        continue;
      }
      buffer = await resp.body();
    } catch (e) {
      log('  skip (fetch failed)', url, e.message.split('\n')[0]);
      continue;
    }
  }
  if (buffer.length < MIN_IMAGE_BYTES) {
    log('  skip (<1KB)', url);
    continue;
  }

  let name = filenameFromUrl(url);
  if (name.endsWith('.img')) {
    const ext = extFromContentType(contentType);
    if (ext) name = name.replace(/\.img$/, ext);
  }
  const hash = sha1(buffer);
  if (savedByName.has(name) && savedByName.get(name) !== hash) {
    name = name.replace(/(\.[a-z0-9]+)$/i, `-${hash}$1`);
  }
  if (!savedByName.has(name)) {
    writeFileSync(join(IMG_DIR, name), buffer);
    savedByName.set(name, hash);
    manifest.push({
      filename: name,
      bytes: buffer.length,
      sourceUrl: url,
      firstSeenOn: meta.firstSeenOn,
      via: meta.via,
    });
    log('  saved', name, `(${(buffer.length / 1024).toFixed(1)}KB)`);
  }
}

// image analysis: dimensions + dominant colors via canvas ---------------------
log('analyzing images (dimensions + dominant colors)...');
const analysisPage = await context.newPage();
for (const entry of manifest) {
  const filePath = join(IMG_DIR, entry.filename);
  if (entry.filename.endsWith('.svg')) {
    const svg = readFileSync(filePath, 'utf8');
    const fills = new Set();
    for (const m of svg.matchAll(
      /(?:fill|stroke|stop-color)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g,
    ))
      fills.add(m[1].toLowerCase());
    const vb = svg.match(/viewBox\s*=\s*["']([\d.\s-]+)["']/);
    if (vb) {
      const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
      entry.width = w;
      entry.height = h;
    }
    entry.svgFills = [...fills];
    continue;
  }
  try {
    const mime =
      {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        avif: 'image/avif',
        ico: 'image/x-icon',
      }[entry.filename.split('.').pop().toLowerCase()] || 'image/png';
    const dataUrl = `data:${mime};base64,` + readFileSync(filePath).toString('base64');
    const result = await analysisPage.evaluate(async (fileUrl) => {
      const img = new Image();
      img.src = fileUrl;
      await img.decode();
      const w = img.naturalWidth,
        h = img.naturalHeight;
      const size = 48;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const r = data[i] & 0xf0,
          g = data[i + 1] & 0xf0,
          b = data[i + 2] & 0xf0;
        const key = (r << 16) | (g << 8) | b;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, n]) => ({
          hex:
            '#' +
            [(k >> 16) & 255, (k >> 8) & 255, k & 255]
              .map((v) => (v + 8).toString(16).padStart(2, '0'))
              .join(''),
          share: Math.round((n / (size * size)) * 100) / 100,
        }));
      return { w, h, top };
    }, dataUrl);
    entry.width = result.w;
    entry.height = result.h;
    entry.dominantColors = result.top;
  } catch (e) {
    entry.analysisError = e.message.split('\n')[0];
  }
}

await browser.close();

// palette aggregation ---------------------------------------------------------
const freq = new Map(); // hex -> { count, sources: Set }
function tally(raw, source) {
  const c = normalizeColor(raw);
  if (!c || c.alpha === 0) return;
  const cur = freq.get(c.hex) || { count: 0, sources: new Set(), rgb: c };
  cur.count++;
  if (cur.sources.size < 6) cur.sources.add(source);
  freq.set(c.hex, cur);
}

for (const pd of pageData) {
  for (const p of pd.picks || []) {
    tally(p.color, `computed color on ${p.label} (${pd.url})`);
    tally(p.backgroundColor, `computed background on ${p.label} (${pd.url})`);
    tally(p.borderColor, `computed border on ${p.label} (${pd.url})`);
  }
  for (const sc of pd.sheetColors || []) tally(sc, `stylesheet rule (${pd.url})`);
}
for (const [cssUrl, text] of cssFiles) {
  for (const m of text.matchAll(COLOR_RE)) tally(m[0], `raw css ${cssUrl.split('/').pop()}`);
}
for (const entry of manifest) {
  for (const f of entry.svgFills || []) tally(f, `SVG fill in ${entry.filename}`);
}

const palette = [...freq.entries()]
  .map(([hex, v]) => ({
    hex,
    count: v.count,
    nearWhite: isNearWhite(v.rgb),
    nearBlack: isNearBlack(v.rgb),
    gray: isGray(v.rgb),
    sources: [...v.sources],
  }))
  .sort((a, b) => b.count - a.count);

// fonts -----------------------------------------------------------------------
const fonts = {};
for (const pd of pageData) {
  for (const p of pd.picks || []) {
    if (!p.fontFamily) continue;
    const key = /^h\d/.test(p.label)
      ? 'headings'
      : p.label === 'body' || p.label === 'p'
        ? 'body'
        : null;
    if (key && !fonts[key]) fonts[key] = p.fontFamily;
  }
}

// write outputs -----------------------------------------------------------------
const raw = {
  extractedAt: new Date().toISOString(),
  base: BASE,
  pages: pageData.map(({ bodyText, ...rest }) => rest),
  bodyTexts: Object.fromEntries(pageData.map((p) => [p.url, p.bodyText || ''])),
  palette,
  fonts,
  cssFiles: [...cssFiles.keys()],
};
writeFileSync(join(BRAND_DIR, 'extraction-raw.json'), JSON.stringify(raw, null, 2));
manifest.sort((a, b) => b.bytes - a.bytes);
writeFileSync(
  join(BRAND_DIR, 'image-manifest.json'),
  JSON.stringify(
    manifest.map((m) => ({ description: '', ...m })),
    null,
    2,
  ),
);

log('wrote assets/brand/extraction-raw.json and assets/brand/image-manifest.json');
log(`images saved: ${manifest.length}; palette entries: ${palette.length}`);
log(
  'top colors:',
  palette
    .filter((p) => !p.nearWhite && !p.nearBlack)
    .slice(0, 12)
    .map((p) => `${p.hex}(${p.count})`)
    .join(' '),
);
