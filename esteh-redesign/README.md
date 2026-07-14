# Esteh Indonesia — Premium Redesign Template (OmniStack Digital)

Redesign template for [estehindonesia.com](https://www.estehindonesia.com/) built from the
site's **real** brand assets — extracted colors, logo, photography, and copy. No placeholders.

## Workflow

**Part 1 — Extraction** (`npm run extract`)

`scripts/extract.mjs` opens the live site (home, `/corporate`, `/news`, `/partnership`,
`/merchandise`, `/membership`) in headless Chromium and:

- captures every image the pages request (network response sniffing) plus all
  `<img src>`/`srcset`, CSS `background-image`, `/_next/static/media/*` and `/images/*` URLs,
  resolving `/_next/image?url=…` optimizer URLs to their originals
- downloads every unique image ≥1KB into `assets/images/` with original filenames
- extracts the palette from computed styles (body/header/nav/buttons/links/footer/brand-ish
  class names) and every stylesheet (in-page rules + raw `/_next/static/css/*` files),
  deduped and frequency-sorted, each hex tagged with where it was found
- reads logo colors directly from SVG fills / dominant raster pixels (brand ground truth)
- records real heading/body `font-family` values
- writes `assets/brand/extraction-raw.json` and `assets/brand/image-manifest.json`
  (filename, dimensions, dominant colors, source URL)

The curated output is `assets/brand/design-tokens.json` — named colors with exact extracted
hex values and provenance notes, fonts, and the annotated image manifest. **All template
colors and images must trace back to this file.**

Test the pipeline without touching the live site:

```sh
node scripts/extract.mjs --base http://127.0.0.1:8081 --pages "/"
```

**Part 2 — Template** (`npm run dev`)

Single-page premium template in `src/` — Vite + Lenis (smooth scroll) + GSAP/ScrollTrigger
(scroll animation) + Three.js (hero 3D). Colors only via CSS custom properties generated from
`design-tokens.json`; images only from `assets/images/`. Ports to Next.js 15 later.

## Status

- [x] Extraction pipeline built and verified end-to-end against a local fixture site
- [ ] **Blocked:** live-site extraction — this remote environment's egress policy currently
      denies `www.estehindonesia.com` (proxy CONNECT 403). Allow the domain (or all domains)
      in the Claude Code environment's network settings, then run `npm run extract`.
- [ ] Curate `assets/brand/design-tokens.json` + annotate image manifest (needs extraction)
- [ ] Palette confirmation
- [ ] Build template sections (nav, hero, story, menu cards, stats, CTA, footer)
- [ ] Global polish (custom cursor, grain, reduced-motion, mobile) + screenshots
