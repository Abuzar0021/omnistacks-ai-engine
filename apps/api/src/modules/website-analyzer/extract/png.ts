const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Reads width/height from a PNG buffer's IHDR chunk, avoiding an image
 * library dependency for a single-purpose need (Playwright screenshots are
 * always PNG).
 */
export function readPngDimensions(buffer: Buffer): ImageDimensions {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG buffer');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
