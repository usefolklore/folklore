/**
 * image_metadata source adapter.
 *
 * Extracts structural metadata from image files without any external
 * dependencies. Parses the JFIF/EXIF header bytes directly from the
 * first 64 KB of each file to surface camera model, date, dimensions,
 * and GPS coordinates when present.
 *
 * Config:
 *   {
 *     path: string   // path to a single image file or a directory
 *   }
 *
 * When `path` points to a directory the adapter walks it recursively
 * and collects all .jpg, .jpeg, .png, and .webp files.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

// ─────────────────────── config ──────────────────────────

interface ImageMetadataConfig {
  readonly path: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): ImageMetadataConfig | null => {
  const p = raw.path;
  if (typeof p !== 'string' || p.length === 0) return null;
  return { path: p };
};

// ─────────────────────── file discovery ──────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const collectImages = (target: string): readonly string[] => {
  if (!existsSync(target)) return [];

  const stat = statSync(target);
  if (stat.isFile()) {
    return IMAGE_EXTENSIONS.has(extname(target).toLowerCase()) ? [target] : [];
  }

  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
        files.push(full);
      }
    }
  };
  walk(target);
  return files;
};

// ─────────────────────── EXIF parsing ────────────────────

/** Parsed EXIF fields — all optional since any may be absent. */
interface ExifData {
  readonly camera?: string;
  readonly date?: string;
  readonly width?: number;
  readonly height?: number;
  readonly gps?: string;
}

/** Read a 16-bit big-endian unsigned int from a buffer. */
const readU16BE = (buf: Buffer, offset: number): number =>
  (buf[offset] << 8) | buf[offset + 1];

/** Read a 32-bit unsigned int respecting TIFF byte-order. */
const readU32 = (buf: Buffer, offset: number, le: boolean): number =>
  le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);

/** Read a 16-bit unsigned int respecting TIFF byte-order. */
const readU16 = (buf: Buffer, offset: number, le: boolean): number =>
  le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);

/** Read a TIFF rational (two u32 values = numerator / denominator). */
const readRational = (buf: Buffer, offset: number, le: boolean): number => {
  const num = readU32(buf, offset, le);
  const den = readU32(buf, offset + 4, le);
  return den === 0 ? 0 : num / den;
};

/** Read a null-terminated ASCII string from the buffer. */
const readAscii = (buf: Buffer, offset: number, count: number): string => {
  const end = Math.min(offset + count, buf.length);
  let s = '';
  for (let i = offset; i < end; i++) {
    const c = buf[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
};

/** Convert three EXIF rationals (deg, min, sec) to a decimal degree. */
const dmsToDecimal = (buf: Buffer, offset: number, le: boolean): number => {
  const deg = readRational(buf, offset, le);
  const min = readRational(buf, offset + 8, le);
  const sec = readRational(buf, offset + 16, le);
  return deg + min / 60 + sec / 3600;
};

/**
 * Parse EXIF from the first chunk of a JPEG file.
 *
 * JPEG structure:  SOI (FFD8) -> APP1 marker (FFE1) -> length -> "Exif\0\0" -> TIFF header -> IFDs
 *
 * We only handle JPEG EXIF (the overwhelmingly common case for camera images).
 * PNG/WebP files get filename-only metadata.
 */
const parseExif = (buf: Buffer): ExifData => {
  const result: { camera?: string; date?: string; width?: number; height?: number; gps?: string } = {};

  // Must start with JPEG SOI marker
  if (buf.length < 12 || buf[0] !== 0xff || buf[1] !== 0xd8) return result;

  // Walk markers looking for APP1 (0xFFE1)
  let pos = 2;
  while (pos + 4 < buf.length) {
    if (buf[pos] !== 0xff) break;
    const marker = buf[pos + 1];
    const segLen = readU16BE(buf, pos + 2);

    if (marker === 0xe1) {
      // APP1 — check for "Exif\0\0"
      const exifStart = pos + 4;
      if (
        exifStart + 6 < buf.length &&
        buf[exifStart] === 0x45 && // E
        buf[exifStart + 1] === 0x78 && // x
        buf[exifStart + 2] === 0x69 && // i
        buf[exifStart + 3] === 0x66 && // f
        buf[exifStart + 4] === 0x00 &&
        buf[exifStart + 5] === 0x00
      ) {
        const tiffStart = exifStart + 6;
        if (tiffStart + 8 > buf.length) return result;

        // TIFF byte order: "II" = little-endian, "MM" = big-endian
        const le = buf[tiffStart] === 0x49; // 'I'
        const ifdOffset = readU32(buf, tiffStart + 4, le);
        parseIFD(buf, tiffStart, tiffStart + ifdOffset, le, result);
      }
      break; // only one APP1
    }

    pos += 2 + segLen;
  }

  return result;
};

// EXIF tag IDs we care about
const TAG_IMAGE_WIDTH = 0x0100;
const TAG_IMAGE_HEIGHT = 0x0101;
const TAG_MODEL = 0x0110;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

type MutableExif = { camera?: string; date?: string; width?: number; height?: number; gps?: string };

const parseIFD = (
  buf: Buffer,
  tiffBase: number,
  ifdStart: number,
  le: boolean,
  out: MutableExif,
): void => {
  if (ifdStart + 2 > buf.length) return;
  const count = readU16(buf, ifdStart, le);
  let gpsIfdOffset: number | undefined;
  let exifIfdOffset: number | undefined;

  for (let i = 0; i < count; i++) {
    const entryOff = ifdStart + 2 + i * 12;
    if (entryOff + 12 > buf.length) break;

    const tag = readU16(buf, entryOff, le);
    const type = readU16(buf, entryOff + 2, le);
    const cnt = readU32(buf, entryOff + 4, le);
    const valOff = entryOff + 8;

    switch (tag) {
      case TAG_IMAGE_WIDTH:
        out.width = type === 3 ? readU16(buf, valOff, le) : readU32(buf, valOff, le);
        break;
      case TAG_IMAGE_HEIGHT:
        out.height = type === 3 ? readU16(buf, valOff, le) : readU32(buf, valOff, le);
        break;
      case TAG_MODEL: {
        const strOff = cnt > 4 ? tiffBase + readU32(buf, valOff, le) : valOff;
        if (strOff + cnt <= buf.length) out.camera = readAscii(buf, strOff, cnt);
        break;
      }
      case TAG_DATETIME: {
        const strOff = cnt > 4 ? tiffBase + readU32(buf, valOff, le) : valOff;
        if (strOff + cnt <= buf.length) out.date = readAscii(buf, strOff, cnt);
        break;
      }
      case TAG_EXIF_IFD:
        exifIfdOffset = readU32(buf, valOff, le);
        break;
      case TAG_GPS_IFD:
        gpsIfdOffset = readU32(buf, valOff, le);
        break;
    }
  }

  // Recurse into EXIF sub-IFD for date/dimensions if not found yet
  if (exifIfdOffset !== undefined) {
    parseIFD(buf, tiffBase, tiffBase + exifIfdOffset, le, out);
  }

  // Parse GPS IFD
  if (gpsIfdOffset !== undefined) {
    parseGpsIFD(buf, tiffBase, tiffBase + gpsIfdOffset, le, out);
  }
};

const parseGpsIFD = (
  buf: Buffer,
  tiffBase: number,
  ifdStart: number,
  le: boolean,
  out: MutableExif,
): void => {
  if (ifdStart + 2 > buf.length) return;
  const count = readU16(buf, ifdStart, le);
  let latRef = '';
  let lonRef = '';
  let lat = 0;
  let lon = 0;
  let hasLat = false;
  let hasLon = false;

  for (let i = 0; i < count; i++) {
    const entryOff = ifdStart + 2 + i * 12;
    if (entryOff + 12 > buf.length) break;

    const tag = readU16(buf, entryOff, le);
    const valOff = entryOff + 8;

    switch (tag) {
      case TAG_GPS_LAT_REF:
        latRef = String.fromCharCode(buf[valOff]);
        break;
      case TAG_GPS_LON_REF:
        lonRef = String.fromCharCode(buf[valOff]);
        break;
      case TAG_GPS_LAT: {
        const dataOff = tiffBase + readU32(buf, valOff, le);
        if (dataOff + 24 <= buf.length) {
          lat = dmsToDecimal(buf, dataOff, le);
          hasLat = true;
        }
        break;
      }
      case TAG_GPS_LON: {
        const dataOff = tiffBase + readU32(buf, valOff, le);
        if (dataOff + 24 <= buf.length) {
          lon = dmsToDecimal(buf, dataOff, le);
          hasLon = true;
        }
        break;
      }
    }
  }

  if (hasLat && hasLon) {
    const latVal = latRef === 'S' ? -lat : lat;
    const lonVal = lonRef === 'W' ? -lon : lon;
    out.gps = `${latVal.toFixed(6)}, ${lonVal.toFixed(6)}`;
  }
};

// ─────────────────────── content builder ─────────────────

const buildContentItem = (filePath: string): ContentItem => {
  const filename = basename(filePath);

  // Read first 64 KB for EXIF parsing
  let exif: ExifData = {};
  try {
    const fd = readFileSync(filePath);
    const chunk = fd.subarray(0, 65536);
    exif = parseExif(chunk as Buffer);
  } catch {
    // File unreadable — fall back to filename-only metadata
  }

  const parts: string[] = [`Image: ${filename}`];
  const exifParts: string[] = [];

  if (exif.camera) exifParts.push(`camera=${exif.camera}`);
  if (exif.date) exifParts.push(`date=${exif.date}`);
  if (exif.width && exif.height) exifParts.push(`dimensions=${exif.width}x${exif.height}`);
  if (exif.gps) exifParts.push(`GPS=${exif.gps}`);

  if (exifParts.length > 0) {
    parts.push(`EXIF: ${exifParts.join(', ')}`);
  }

  return {
    source_uri: `file://${filePath}`,
    title: filename,
    text: parts.join('. '),
    metadata: {
      kind: 'image_metadata',
      file_path: filePath,
      ...(exif.camera ? { camera: exif.camera } : {}),
      ...(exif.date ? { exif_date: exif.date } : {}),
      ...(exif.width ? { width: exif.width } : {}),
      ...(exif.height ? { height: exif.height } : {}),
      ...(exif.gps ? { gps: exif.gps } : {}),
    },
  };
};

// ─────────────────────── source factory ──────────────────

export const imageMetadataSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.path',
          node_id: descriptor.id,
        });
      }

      try {
        const files = collectImages(cfg.path);
        if (files.length === 0) {
          return okAsync<readonly ContentItem[], AppError>([{
            source_uri: `file://${cfg.path}`,
            title: basename(cfg.path),
            text: `Image: ${basename(cfg.path)}. No supported image files found at path.`,
            metadata: { kind: 'image_metadata', file_path: cfg.path },
          }]);
        }
        const items = files.map(buildContentItem);
        return okAsync(items);
      } catch (e) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: cfg.path,
          message: (e as Error).message,
        });
      }
    };

    return { descriptor, fetch: fetchItems };
  };
