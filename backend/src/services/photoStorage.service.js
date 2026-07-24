import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { photoStorageConfig } from '../config/photoStorage.js';

// This module is the ONLY code in the backend that touches
// photoStorageConfig.photosDir directly (T-16-03/T-16-04/T-16-05).

export function generatePhotoFilename(ext) {
  return `${crypto.randomUUID()}.${ext}`;
}

export function resolvePhotoPath(filename) {
  return path.join(photoStorageConfig.photosDir, filename);
}

export async function writePhotoFile(buffer, filename) {
  await fs.mkdir(photoStorageConfig.photosDir, { recursive: true });
  await fs.writeFile(resolvePhotoPath(filename), buffer);
}

export async function deletePhotoFile(filename) {
  if (filename == null) return;
  try {
    await fs.unlink(resolvePhotoPath(filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function finalizePhotoReplacement({ buffer, ext, previousFilename, commit }) {
  const newFilename = generatePhotoFilename(ext);
  await writePhotoFile(buffer, newFilename);

  try {
    await commit(newFilename);
  } catch (err) {
    await deletePhotoFile(newFilename);
    throw err;
  }

  if (previousFilename != null) {
    await deletePhotoFile(previousFilename);
  }

  return newFilename;
}
