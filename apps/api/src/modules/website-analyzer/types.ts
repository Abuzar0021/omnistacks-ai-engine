/** Shared types for the website analyzer module (capture -> extract -> service). */

export interface AnchorInfo {
  href: string;
  text: string;
  inNav: boolean;
  inFooter: boolean;
}

export interface ImageInfo {
  src: string;
  alt: string;
}

export interface VideoInfo {
  src: string;
  type: 'video' | 'embed';
}

export interface FormInfo {
  action: string;
  method: string;
  fieldCount: number;
  fieldNames: string[];
}

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type Headings = Record<HeadingLevel, string[]>;

/** Technology-detection signals gathered in-browser (live DOM/window checks). */
export interface TechnologySignals {
  scriptSrcs: string[];
  headers: Record<string, string>;
  generatorMeta: string | null;
  hasWpContentAsset: boolean;
  hasShopifyGlobal: boolean;
  hasWixGlobal: boolean;
  hasSquarespaceGlobal: boolean;
  hasNextData: boolean;
  hasReactDevtoolsHook: boolean;
  hasReactRootAttr: boolean;
  hasVueGlobal: boolean;
  ngVersion: string | null;
  hasDataLayer: boolean;
  hasGtagFn: boolean;
  hasGaFn: boolean;
  hasFbq: boolean;
}

/** Raw data extracted from the page via a single page.evaluate() call. */
export interface PageExtract {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  faviconUrl: string | null;
  headings: Headings;
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  jsonLdRaw: string[];
  anchors: AnchorInfo[];
  images: ImageInfo[];
  videos: VideoInfo[];
  forms: FormInfo[];
  bodyText: string;
  scriptSrcs: string[];
  generatorMeta: string | null;
  hasWpContentAsset: boolean;
  hasShopifyGlobal: boolean;
  hasWixGlobal: boolean;
  hasSquarespaceGlobal: boolean;
  hasNextData: boolean;
  hasReactDevtoolsHook: boolean;
  hasReactRootAttr: boolean;
  hasVueGlobal: boolean;
  ngVersion: string | null;
  hasDataLayer: boolean;
  hasGtagFn: boolean;
  hasGaFn: boolean;
  hasFbq: boolean;
}

/** Full result of driving a browser against a URL — capture.ts's output. */
export interface CaptureResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number | null;
  redirectCount: number;
  headers: Record<string, string>;
  page: PageExtract;
  screenshot: Buffer;
}

export type NavigationErrorCategory = 'TIMEOUT' | 'SSL' | 'DNS' | 'UNKNOWN';

export class NavigationError extends Error {
  constructor(
    readonly category: NavigationErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'NavigationError';
  }
}
