import { EXPORT_VERSION, type ScanEntry } from './types';
import { getAllEntries, getImage } from './db';

// JSON export. Self-contained: when an entry has a stored frame, it is inlined
// as a data URL so the export file stands alone with no external references.

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface ExportEntry extends ScanEntry {
  /** ISO-8601 form of `timestamp`, for human readability. */
  scannedAt: string;
  /** Inlined frame image as a data URL, when present. */
  image?: string;
}

export async function buildExport(): Promise<string> {
  const entries = await getAllEntries();
  const out: ExportEntry[] = [];
  for (const e of entries) {
    const item: ExportEntry = { ...e, scannedAt: new Date(e.timestamp).toISOString() };
    if (e.hasImage) {
      const blob = await getImage(e.id);
      if (blob) item.image = await blobToDataUrl(blob);
    }
    out.push(item);
  }
  return JSON.stringify(
    {
      app: 'qr.codemonkey.ro',
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      count: out.length,
      entries: out
    },
    null,
    2
  );
}

export async function downloadExport(): Promise<void> {
  const json = await buildExport();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `qr-scans-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
