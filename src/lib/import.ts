import { EXPORT_VERSION, type GpsFix, type ScanEntry } from './types';

// JSON import: the inverse of export.ts. Parsing/validation is pure (no DB) so it
// can be unit-tested; persisting is done by `importEntries` in db.ts.
//
// Merge semantics: imported entries are added alongside existing history. An entry
// whose `id` already exists is skipped (scans are immutable records, so the same id
// means the same scan — re-importing the same file is a no-op).

export interface ImportItem {
  entry: ScanEntry;
  image?: Blob;
}

export interface ParsedImport {
  items: ImportItem[];
  /** Entries in the file that were malformed and dropped. */
  invalid: number;
}

export class ImportError extends Error {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseGps(v: unknown): GpsFix | null {
  if (!isObject(v)) return null;
  const { lat, lng, accuracy } = v;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { lat, lng, accuracy: isFiniteNumber(accuracy) ? accuracy : 0 };
}

/** Decode a base64 `data:image/...` URL into a Blob. Anything else → undefined. */
export function dataUrlToBlob(dataUrl: unknown): Blob | undefined {
  if (typeof dataUrl !== 'string') return undefined;
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]*)$/.exec(dataUrl);
  if (!m) return undefined;
  try {
    const bin = atob(m[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return undefined;
  }
}

function parseEntry(raw: unknown): ImportItem | null {
  if (!isObject(raw)) return null;
  const { id, code, format, timestamp, note, gps, image } = raw;
  if (typeof code !== 'string' || typeof format !== 'string') return null;
  // Prefer the numeric timestamp; fall back to the human-readable `scannedAt`.
  const ts = isFiniteNumber(timestamp)
    ? timestamp
    : typeof raw.scannedAt === 'string'
      ? Date.parse(raw.scannedAt)
      : NaN;
  if (!Number.isFinite(ts)) return null;

  const blob = dataUrlToBlob(image);
  const entry: ScanEntry = {
    id: typeof id === 'string' && id ? id : crypto.randomUUID(),
    code,
    format,
    timestamp: ts,
    gps: parseGps(gps),
    hasImage: Boolean(blob)
  };
  if (typeof note === 'string' && note) entry.note = note;
  return blob ? { entry, image: blob } : { entry };
}

/** Parse and validate the text of an export file. Throws ImportError if it isn't one. */
export function parseImport(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('Not a valid JSON file.');
  }
  if (!isObject(data) || data.app !== 'qr.codemonkey.ro' || !Array.isArray(data.entries)) {
    throw new ImportError('Not a QR scanner export file.');
  }
  if (isFiniteNumber(data.version) && data.version > EXPORT_VERSION) {
    throw new ImportError(
      `This export is from a newer version of the app (format v${data.version}). Update the app and try again.`
    );
  }

  // Duplicate ids (within the file or vs. existing history) are handled at
  // insert time by importEntries, which counts them as skipped.
  const items: ImportItem[] = [];
  let invalid = 0;
  for (const raw of data.entries) {
    const item = parseEntry(raw);
    if (item) items.push(item);
    else invalid++;
  }
  return { items, invalid };
}
