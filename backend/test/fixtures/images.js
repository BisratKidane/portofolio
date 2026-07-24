import zlib from 'node:zlib';

// Real (not hand-rolled/fake) minimal valid image byte fixtures for the
// photo-upload adversarial/happy-path test suite (Phase 16). Each image is
// constructed byte-for-byte per its format's actual specification (PNG:
// ISO/IEC 15948, JPEG: ITU-T T.81 baseline DCT, WebP: RFC 9649 lossless) --
// not a hand-wavy "magic bytes + garbage" fake. All three were independently
// verified during authoring against macOS's ImageIO decoder (`sips`) and
// libmagic (`file`), in addition to this fixture's own file-type self-check
// (images.test.js) -- confirming they fully decode as genuine 1x1 pixel
// images, not merely pass a signature sniff.

/**
 * Builds a length-prefixed, CRC32-checked PNG chunk (type + data + crc),
 * per the PNG chunk layout spec.
 */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * A real, spec-valid 1x1 solid-red PNG (8-bit RGB, no interlace):
 * signature + IHDR + one zlib-deflated scanline (filter byte + RGB pixel)
 * in an IDAT chunk + IEND.
 */
export const validPngBuffer = (() => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type 2 = truecolor (RGB)
  ihdrData.writeUInt8(0, 10); // compression method
  ihdrData.writeUInt8(0, 11); // filter method
  ihdrData.writeUInt8(0, 12); // interlace method
  const ihdr = pngChunk('IHDR', ihdrData);

  const rawScanline = Buffer.from([0x00, 0xff, 0x00, 0x00]); // filter=None, pixel=red
  const idat = pngChunk('IDAT', zlib.deflateSync(rawScanline));

  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
})();

/**
 * A real, spec-valid 1x1 baseline-DCT grayscale JPEG (JFIF). Uses
 * self-defined (non-"standard-annex") but fully spec-legal Huffman tables
 * with a single trivial symbol each -- DC category 0 (zero DC diff) and AC
 * EOB -- so the entropy-coded segment is a single byte. Structurally
 * complete (SOI/APP0/DQT/SOF0/DHT/SOS/EOI), not a magic-bytes-only fake.
 */
export const validJpegBuffer = (() => {
  const parts = [];
  const push = (...bytes) => parts.push(Buffer.from(bytes));

  push(0xff, 0xd8); // SOI

  push(0xff, 0xe0, 0x00, 0x10); // APP0 (JFIF), length 16
  parts.push(Buffer.from('JFIF\0', 'ascii'));
  push(0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);

  push(0xff, 0xdb, 0x00, 0x43, 0x00); // DQT, table id 0, 8-bit precision
  parts.push(Buffer.alloc(64, 1)); // all quant values = 1 (valid, non-zero)

  // SOF0: baseline, 8-bit precision, 1x1, 1 component (grayscale)
  push(0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00);

  // DHT DC table (class 0, id 0): one symbol (0x00), code length 1
  push(0xff, 0xc4, 0x00, 0x14, 0x00);
  parts.push(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  parts.push(Buffer.from([0x00]));

  // DHT AC table (class 1, id 0): one symbol (0x00 = EOB), code length 1
  push(0xff, 0xc4, 0x00, 0x14, 0x10);
  parts.push(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  parts.push(Buffer.from([0x00]));

  push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00); // SOS

  // Entropy data: DC bit '0' + AC-EOB bit '0' = "00", padded with 1s -> 0x3F
  push(0x3f);

  push(0xff, 0xd9); // EOI

  return Buffer.concat(parts);
})();

/**
 * A minimal bit-writer packing bits LSB-first, per RFC 9649's WebP
 * lossless bitstream convention ("the least significant bits are
 * considered to come first in bitstream order").
 */
class LsbFirstBitWriter {
  constructor() {
    this.bits = [];
  }

  pushBits(value, numBits) {
    for (let i = 0; i < numBits; i += 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  toBuffer() {
    const buf = Buffer.alloc(Math.ceil(this.bits.length / 8), 0);
    this.bits.forEach((bit, i) => {
      if (bit) buf[Math.floor(i / 8)] |= 1 << i % 8;
    });
    return buf;
  }
}

function riffChunk(fourCC, data) {
  const header = Buffer.alloc(8);
  header.write(fourCC, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  const padding = data.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  return Buffer.concat([header, data, padding]);
}

/**
 * A real, spec-valid 1x1 lossless (VP8L) WebP: RIFF/WEBP container wrapping
 * a VP8L chunk whose bitstream declares 1x1 dimensions, no transforms, no
 * color cache, and a single-symbol ("simple code length code") Huffman
 * table per channel (Green/Red/Blue/Alpha/Distance) -- the RFC 9649-defined
 * trivial/degenerate case, decoding to one fully black+transparent pixel.
 */
export const validWebpBuffer = (() => {
  const bw = new LsbFirstBitWriter();
  bw.pushBits(0, 14); // width - 1  => width = 1
  bw.pushBits(0, 14); // height - 1 => height = 1
  bw.pushBits(0, 1); // alpha_is_used = 0
  bw.pushBits(0, 3); // version_number = 0 (only valid value)

  bw.pushBits(0, 1); // transform_present = 0 (no transforms)
  bw.pushBits(0, 1); // color_cache_present = 0
  bw.pushBits(0, 1); // use_meta_huffman = 0

  // 5 Huffman code groups: Green+Length+ColorCache, Red, Blue, Alpha, Distance.
  // Each uses the spec's "simple code length code" trivial single-symbol
  // form: simple_code=1, num_symbols-1=0, is_first_8bits=0, symbol=0.
  for (let i = 0; i < 5; i += 1) {
    bw.pushBits(1, 1);
    bw.pushBits(0, 1);
    bw.pushBits(0, 1);
    bw.pushBits(0, 1);
  }
  // No further bits needed: every Huffman tree above has exactly one
  // symbol (a degenerate, code-length-0 tree), so decoding the single 1x1
  // pixel's Green/Red/Blue/Alpha values consumes 0 bits and yields 0.

  const vp8lPayload = Buffer.concat([Buffer.from([0x2f]), bw.toBuffer()]);
  const vp8lChunk = riffChunk('VP8L', vp8lPayload);
  const webpBody = Buffer.concat([Buffer.from('WEBP', 'ascii'), vp8lChunk]);

  const riffHeader = Buffer.alloc(8);
  riffHeader.write('RIFF', 0, 'ascii');
  riffHeader.writeUInt32LE(webpBody.length, 4);

  return Buffer.concat([riffHeader, webpBody]);
})();

/**
 * Real non-image bytes (a shell-script-like text payload) for the
 * mislabeled-content-type adversarial vector -- a client could set
 * `Content-Type: image/jpeg` on this buffer, and file-type's magic-byte
 * sniff must not be fooled by the declared header.
 */
export const nonImageBuffer = Buffer.from('#!/bin/sh\necho "not an image"\n', 'utf8');

/**
 * Returns a buffer one byte over the 5 MB upload cap (D-04), filled with
 * a constant byte -- used only for the oversized-file adversarial test,
 * where content-type validity is irrelevant (the size check must reject
 * it before any magic-byte sniff is attempted).
 */
export function oversizedImageBuffer() {
  return Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
}
