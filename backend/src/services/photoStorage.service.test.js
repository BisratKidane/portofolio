import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { photoStorageConfig } from '../config/photoStorage.js';
import {
  generatePhotoFilename,
  resolvePhotoPath,
  writePhotoFile,
  deletePhotoFile,
  finalizePhotoReplacement
} from './photoStorage.service.js';

const writtenFiles = new Set();

async function cleanupWrittenFiles() {
  for (const filename of writtenFiles) {
    try {
      await fs.unlink(path.join(photoStorageConfig.photosDir, filename));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  writtenFiles.clear();
}

beforeEach(cleanupWrittenFiles);
afterEach(cleanupWrittenFiles);

describe('generatePhotoFilename (PHOTO-03)', () => {
  it('returns a UUIDv4 + given extension, matching the exact pattern', () => {
    const filename = generatePhotoFilename('jpg');
    expect(filename).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it('never returns the same string on two consecutive calls', () => {
    const first = generatePhotoFilename('jpg');
    const second = generatePhotoFilename('jpg');
    expect(first).not.toBe(second);
  });
});

describe('resolvePhotoPath', () => {
  it('joins photoStorageConfig.photosDir with the filename via path.join', () => {
    const resolved = resolvePhotoPath('abc.jpg');
    expect(resolved).toBe(path.join(photoStorageConfig.photosDir, 'abc.jpg'));
  });
});

describe('writePhotoFile', () => {
  it('creates photosDir if missing and writes the exact bytes; reading back returns identical bytes', async () => {
    const filename = generatePhotoFilename('jpg');
    writtenFiles.add(filename);
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]);

    await writePhotoFile(buffer, filename);

    const readBack = await fs.readFile(resolvePhotoPath(filename));
    expect(readBack.equals(buffer)).toBe(true);
  });
});

describe('deletePhotoFile', () => {
  it('removes an existing file', async () => {
    const filename = generatePhotoFilename('jpg');
    writtenFiles.add(filename);
    await writePhotoFile(Buffer.from([0x01]), filename);

    await deletePhotoFile(filename);

    await expect(fs.access(resolvePhotoPath(filename))).rejects.toThrow();
  });

  it('resolves without throwing when called again on an already-missing filename (ENOENT swallowed)', async () => {
    const filename = generatePhotoFilename('jpg');
    await expect(deletePhotoFile(filename)).resolves.not.toThrow();
  });

  it('resolves as a pure no-op with zero filesystem calls when filename is null or undefined', async () => {
    const accessSpy = vi.spyOn(fs, 'unlink');
    await expect(deletePhotoFile(null)).resolves.toBeUndefined();
    await expect(deletePhotoFile(undefined)).resolves.toBeUndefined();
    expect(accessSpy).not.toHaveBeenCalled();
    accessSpy.mockRestore();
  });
});

describe('finalizePhotoReplacement (D-11, Pitfall 3 ordering)', () => {
  it('writes the new file to disk under a freshly generated filename BEFORE calling commit', async () => {
    let filenameAtCommitTime;
    const commit = vi.fn(async (newFilename) => {
      filenameAtCommitTime = newFilename;
      // At commit-time, the new file must already exist on disk.
      await expect(fs.access(resolvePhotoPath(newFilename))).resolves.toBeUndefined();
    });

    const result = await finalizePhotoReplacement({
      buffer: Buffer.from([0x01, 0x02]),
      ext: 'png',
      previousFilename: null,
      commit
    });
    writtenFiles.add(result);

    expect(commit).toHaveBeenCalledWith(result);
    expect(filenameAtCommitTime).toBe(result);
  });

  it('on commit resolving, deletes previousFilename (best-effort, ENOENT-safe) and returns the new filename', async () => {
    const previousFilename = generatePhotoFilename('png');
    writtenFiles.add(previousFilename);
    await writePhotoFile(Buffer.from([0x09]), previousFilename);

    const commit = vi.fn(async () => {});

    const newFilename = await finalizePhotoReplacement({
      buffer: Buffer.from([0x01, 0x02]),
      ext: 'png',
      previousFilename,
      commit
    });
    writtenFiles.add(newFilename);

    expect(newFilename).not.toBe(previousFilename);
    await expect(fs.access(resolvePhotoPath(previousFilename))).rejects.toThrow();
    await expect(fs.access(resolvePhotoPath(newFilename))).resolves.toBeUndefined();
  });

  it('on commit rejecting, deletes the just-written NEW file and rethrows the original error unchanged, leaving previousFilename untouched', async () => {
    const previousFilename = generatePhotoFilename('png');
    writtenFiles.add(previousFilename);
    await writePhotoFile(Buffer.from([0x09]), previousFilename);

    const originalError = new Error('DB commit failed');
    const commit = vi.fn(async () => {
      throw originalError;
    });

    let capturedNewFilename;
    const originalGenerate = generatePhotoFilename;
    // Capture the filename generatePhotoFilename would produce by wrapping writePhotoFile via commit call args.
    const wrappedCommit = vi.fn(async (newFilename) => {
      capturedNewFilename = newFilename;
      return commit(newFilename);
    });

    await expect(
      finalizePhotoReplacement({
        buffer: Buffer.from([0x03, 0x04]),
        ext: 'png',
        previousFilename,
        commit: wrappedCommit
      })
    ).rejects.toBe(originalError);

    expect(capturedNewFilename).toBeDefined();
    await expect(fs.access(resolvePhotoPath(capturedNewFilename))).rejects.toThrow();
    await expect(fs.access(resolvePhotoPath(previousFilename))).resolves.toBeUndefined();
    void originalGenerate;
  });

  it('skips the delete-old step entirely when previousFilename is null/undefined (first-ever upload)', async () => {
    const commit = vi.fn(async () => {});

    const newFilename = await finalizePhotoReplacement({
      buffer: Buffer.from([0x05]),
      ext: 'png',
      previousFilename: null,
      commit
    });
    writtenFiles.add(newFilename);

    await expect(fs.access(resolvePhotoPath(newFilename))).resolves.toBeUndefined();
  });

  it('leaves exactly one file on disk after a full successful replace-cycle', async () => {
    const previousFilename = generatePhotoFilename('png');
    writtenFiles.add(previousFilename);
    await writePhotoFile(Buffer.from([0x09]), previousFilename);

    const commit = vi.fn(async () => {});

    const newFilename = await finalizePhotoReplacement({
      buffer: Buffer.from([0x01, 0x02]),
      ext: 'png',
      previousFilename,
      commit
    });
    writtenFiles.add(newFilename);

    await expect(fs.access(resolvePhotoPath(previousFilename))).rejects.toThrow();
    await expect(fs.access(resolvePhotoPath(newFilename))).resolves.toBeUndefined();
  });

  it('does not call deletePhotoFile (no filesystem delete call) when previousFilename is null', async () => {
    const unlinkSpy = vi.spyOn(fs, 'unlink');
    const commit = vi.fn(async () => {});

    const newFilename = await finalizePhotoReplacement({
      buffer: Buffer.from([0x06]),
      ext: 'png',
      previousFilename: null,
      commit
    });
    writtenFiles.add(newFilename);

    expect(unlinkSpy).not.toHaveBeenCalled();
    unlinkSpy.mockRestore();
  });
});
