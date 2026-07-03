import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { readPngDimensions } from './extract/png.js';

export interface StoredScreenshot {
  /** Path relative to the storage root — what's persisted in the database. */
  path: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: 'image/png';
}

// Anchored to this module's own location (apps/api/), not process.cwd() —
// cwd varies by how the process is launched (npm workspace dev, vitest,
// Docker's WORKDIR) and would otherwise scatter screenshots across
// inconsistent directories between environments.
const API_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const storageRoot = () => resolve(API_ROOT, env.SCREENSHOT_STORAGE_DIR);

/** Exposed for tests that need to clean up written files. */
export function getStorageRoot(): string {
  return storageRoot();
}

/** Filenames are derived from the (cuid) analysis id — never client input. */
function fileNameFor(analysisId: string): string {
  return `${analysisId}.png`;
}

export async function saveScreenshot(
  analysisId: string,
  buffer: Buffer,
): Promise<StoredScreenshot> {
  const relativePath = fileNameFor(analysisId);
  await mkdir(storageRoot(), { recursive: true });
  await writeFile(resolve(storageRoot(), relativePath), buffer);

  const { width, height } = readPngDimensions(buffer);
  return { path: relativePath, width, height, byteSize: buffer.byteLength, mimeType: 'image/png' };
}

export async function readScreenshot(relativePath: string): Promise<Buffer> {
  return readFile(resolve(storageRoot(), relativePath));
}
