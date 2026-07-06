import { describe, expect, it } from 'vitest';
import { readPngDimensions } from './png.js';

// Minimal valid PNG signature + IHDR chunk header encoding a 12x34 image.
// (Chunk CRC/data beyond width/height is irrelevant to this reader.)
function fakePng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = Buffer.alloc(16);
  chunk.write('IHDR', 4);
  chunk.writeUInt32BE(width, 8);
  chunk.writeUInt32BE(height, 12);
  return Buffer.concat([signature, chunk]);
}

describe('readPngDimensions', () => {
  it('reads width and height from a valid PNG buffer', () => {
    expect(readPngDimensions(fakePng(1280, 4096))).toEqual({ width: 1280, height: 4096 });
  });

  it('throws for a buffer with an invalid signature', () => {
    expect(() => readPngDimensions(Buffer.from('not a png at all, definitely'))).toThrow(
      'Not a valid PNG buffer',
    );
  });

  it('throws for a truncated buffer', () => {
    expect(() => readPngDimensions(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toThrow(
      'Not a valid PNG buffer',
    );
  });
});
