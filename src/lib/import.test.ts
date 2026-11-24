import { describe, expect, it } from 'vitest';
import { parseImport, dataUrlToBlob, ImportError } from './import';
import { EXPORT_VERSION } from './types';

// 1x1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function file(entries: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'qr.codemonkey.ro',
    version: EXPORT_VERSION,
    exportedAt: '2026-11-25T10:00:00.000Z',
    count: entries.length,
    entries,
    ...extra
  });
}

const base = {
  id: 'a1',
  code: 'https://example.com',
  format: 'qr_code',
  timestamp: 1764064800000,
  scannedAt: '2025-11-25T10:00:00.000Z'
};

describe('parseImport', () => {
  it('round-trips an exported entry, dropping export-only fields', () => {
    const { items, invalid } = parseImport(
      file([{ ...base, note: 'desk', gps: { lat: 44.4, lng: 26.1, accuracy: 12 }, hasImage: false }])
    );
    expect(invalid).toBe(0);
    expect(items).toHaveLength(1);
    expect(items[0].entry).toEqual({
      id: 'a1',
      code: 'https://example.com',
      format: 'qr_code',
      timestamp: 1764064800000,
      note: 'desk',
      gps: { lat: 44.4, lng: 26.1, accuracy: 12 },
      hasImage: false
    });
    expect(items[0].image).toBeUndefined();
    expect(items[0].entry).not.toHaveProperty('scannedAt');
  });

  it('restores inlined images as blobs and sets hasImage', async () => {
    const { items } = parseImport(file([{ ...base, hasImage: true, image: PNG }]));
    expect(items[0].entry.hasImage).toBe(true);
    expect(items[0].image?.type).toBe('image/png');
    const bytes = new Uint8Array(await items[0].image!.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('clears hasImage when the image is missing or not an image data URL', () => {
    const { items } = parseImport(
      file([
        { ...base, id: 'x', hasImage: true },
        { ...base, id: 'y', hasImage: true, image: 'data:text/html;base64,PGI+' },
        { ...base, id: 'z', hasImage: true, image: 'https://evil.example/x.png' }
      ])
    );
    expect(items.map((i) => i.entry.hasImage)).toEqual([false, false, false]);
    expect(items.every((i) => i.image === undefined)).toBe(true);
  });

  it('counts malformed entries as invalid and keeps the rest', () => {
    const { items, invalid } = parseImport(
      file([base, null, 'nope', { ...base, code: 42 }, { ...base, format: undefined }, { id: 'q' }])
    );
    expect(items).toHaveLength(1);
    expect(invalid).toBe(5);
  });

  it('falls back to scannedAt when timestamp is missing', () => {
    const { timestamp: _t, ...noTs } = base;
    const { items } = parseImport(file([noTs]));
    expect(items[0].entry.timestamp).toBe(Date.parse(base.scannedAt));
  });

  it('generates an id when missing', () => {
    const { id: _id, ...noId } = base;
    const { items } = parseImport(file([noId]));
    expect(typeof items[0].entry.id).toBe('string');
    expect(items[0].entry.id.length).toBeGreaterThan(0);
  });

  it('drops a malformed gps fix rather than the entry', () => {
    const { items } = parseImport(file([{ ...base, gps: { lat: 'x', lng: 1 } }]));
    expect(items[0].entry.gps).toBeNull();
  });

  it('keeps duplicate ids for the DB layer to skip', () => {
    const { items } = parseImport(file([base, base]));
    expect(items).toHaveLength(2);
  });

  it('rejects non-JSON', () => {
    expect(() => parseImport('not json')).toThrow(ImportError);
  });

  it('rejects JSON that is not an export from this app', () => {
    expect(() => parseImport('[]')).toThrow(/Not a QR scanner export/);
    expect(() => parseImport(JSON.stringify({ app: 'other', entries: [] }))).toThrow(ImportError);
    expect(() => parseImport(JSON.stringify({ app: 'qr.codemonkey.ro' }))).toThrow(ImportError);
  });

  it('rejects exports from a newer format version', () => {
    expect(() => parseImport(file([base], { version: EXPORT_VERSION + 1 }))).toThrow(/newer version/);
  });
});

describe('dataUrlToBlob', () => {
  it('returns undefined for non-strings and invalid base64', () => {
    expect(dataUrlToBlob(undefined)).toBeUndefined();
    expect(dataUrlToBlob('data:image/png;base64,!!!')).toBeUndefined();
  });
});
