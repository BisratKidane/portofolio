import { describe, it, expect } from 'vitest';
import { fileTypeFromBuffer } from 'file-type';
import {
  validJpegBuffer,
  validPngBuffer,
  validWebpBuffer,
  nonImageBuffer,
  oversizedImageBuffer
} from './images.js';

// Self-check (Wave 0 gap requirement, T-16-02): proves every image fixture
// this phase's adversarial/happy-path tests will import is a REAL image --
// detected by file-type's actual magic-byte sniff, not merely named as if
// it were one.
describe('image fixtures are real, magic-byte-verified bytes', () => {
  it('validJpegBuffer is detected as image/jpeg', async () => {
    const type = await fileTypeFromBuffer(validJpegBuffer);
    expect(type?.mime).toBe('image/jpeg');
  });

  it('validPngBuffer is detected as image/png', async () => {
    const type = await fileTypeFromBuffer(validPngBuffer);
    expect(type?.mime).toBe('image/png');
  });

  it('validWebpBuffer is detected as image/webp', async () => {
    const type = await fileTypeFromBuffer(validWebpBuffer);
    expect(type?.mime).toBe('image/webp');
  });

  it('nonImageBuffer is not detected as any image mime', async () => {
    const type = await fileTypeFromBuffer(nonImageBuffer);
    // file-type returns `undefined` for content it can't identify (expected
    // here, since this is plain text) -- either that, or a non-image mime,
    // both satisfy "not detected as an image".
    expect(type === undefined || !type.mime.startsWith('image/')).toBe(true);
  });

  it('oversizedImageBuffer() is exactly 5 MB + 1 byte', () => {
    expect(oversizedImageBuffer().length).toBe(5 * 1024 * 1024 + 1);
  });
});
