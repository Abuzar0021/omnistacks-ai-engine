export type WebsiteAnalysisStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface LinkRef {
  href: string;
  text: string;
}

export interface ImageRef {
  src: string;
  alt: string;
}

export interface VideoRef {
  src: string;
  type: 'video' | 'embed';
}

export interface ContactForm {
  action: string;
  method: string;
  fieldCount: number;
  fieldNames: string[];
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Headings {
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
}

export interface WebsiteAnalysis {
  id: string;
  businessId: string;
  status: WebsiteAnalysisStatus;
  requestedUrl: string;
  finalUrl: string | null;
  statusCode: number | null;
  redirectCount: number | null;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  faviconUrl: string | null;
  headings: Headings | null;
  openGraph: Record<string, string> | null;
  twitterCard: Record<string, string> | null;
  jsonLd: unknown[] | null;
  internalLinks: LinkRef[] | null;
  externalLinks: LinkRef[] | null;
  navigationLinks: LinkRef[] | null;
  footerLinks: LinkRef[] | null;
  images: ImageRef[] | null;
  videos: VideoRef[] | null;
  contactForms: ContactForm[] | null;
  emails: string[] | null;
  phones: string[] | null;
  socialLinks: SocialLink[] | null;
  technologies: string[] | null;
  screenshotPath: string | null;
  screenshotWidth: number | null;
  screenshotHeight: number | null;
  screenshotByteSize: number | null;
  screenshotMimeType: string | null;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenshotMeta {
  width: number | null;
  height: number | null;
  byteSize: number | null;
  mimeType: string | null;
  url: string;
}
