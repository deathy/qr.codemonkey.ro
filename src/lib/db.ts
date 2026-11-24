import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ScanEntry } from './types';

// IndexedDB (not localStorage) because saved frame images are blobs and would
// blow past localStorage's ~5MB cap almost immediately.

interface ScannerDB extends DBSchema {
  entries: {
    key: string;
    value: ScanEntry;
    indexes: { 'by-timestamp': number };
  };
  images: {
    key: string;
    value: Blob;
  };
}

const DB_NAME = 'qr-codemonkey';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ScannerDB>> | null = null;

function db(): Promise<IDBPDatabase<ScannerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
        database.createObjectStore('images');
      }
    });
  }
  return dbPromise;
}

export async function addEntry(entry: ScanEntry, image?: Blob): Promise<void> {
  const database = await db();
  const tx = database.transaction(['entries', 'images'], 'readwrite');
  await tx.objectStore('entries').put(entry);
  if (image) {
    await tx.objectStore('images').put(image, entry.id);
  }
  await tx.done;
}

/**
 * Add imported entries in one transaction, skipping any whose id already exists.
 * Returns how many were added and how many were skipped as duplicates.
 */
export async function importEntries(
  items: { entry: ScanEntry; image?: Blob }[]
): Promise<{ added: number; skipped: number }> {
  const database = await db();
  const tx = database.transaction(['entries', 'images'], 'readwrite');
  const entries = tx.objectStore('entries');
  const images = tx.objectStore('images');
  let added = 0;
  let skipped = 0;
  for (const { entry, image } of items) {
    if (await entries.getKey(entry.id)) {
      skipped++;
      continue;
    }
    await entries.add(entry);
    if (image) await images.put(image, entry.id);
    added++;
  }
  await tx.done;
  return { added, skipped };
}

export async function getAllEntries(): Promise<ScanEntry[]> {
  const database = await db();
  // Newest first.
  const all = await database.getAllFromIndex('entries', 'by-timestamp');
  return all.reverse();
}

export async function updateNote(id: string, note: string): Promise<void> {
  const database = await db();
  const entry = await database.get('entries', id);
  if (!entry) return;
  entry.note = note;
  await database.put('entries', entry);
}

export async function deleteEntry(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['entries', 'images'], 'readwrite');
  await tx.objectStore('entries').delete(id);
  await tx.objectStore('images').delete(id);
  await tx.done;
}

export async function getImage(id: string): Promise<Blob | undefined> {
  const database = await db();
  return database.get('images', id);
}

export async function clearAll(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['entries', 'images'], 'readwrite');
  await tx.objectStore('entries').clear();
  await tx.objectStore('images').clear();
  await tx.done;
}
