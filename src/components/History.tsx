import { useEffect, useState } from 'preact/hooks';
import type { ScanEntry } from '../lib/types';
import { formatLabel } from '../lib/content';
import { parsePayload, kindLabel } from '../lib/parse';
import { ParsedBody, ParsedActions } from './ParsedCard';
import { getImage } from '../lib/db';

interface Props {
  entries: ScanEntry[];
  onDelete: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onClearAll: () => void;
  onExport: () => void;
}

export function History({ entries, onDelete, onNote, onClearAll, onExport }: Props) {
  return (
    <div class="history">
      <div class="history-bar">
        <span>{entries.length} {entries.length === 1 ? 'scan' : 'scans'}</span>
        <span class="spacer" />
        <button onClick={onExport} disabled={!entries.length}>Export JSON</button>
        <button
          class="danger"
          onClick={() => {
            if (entries.length && confirm('Delete all scans? This cannot be undone.')) onClearAll();
          }}
          disabled={!entries.length}
        >
          Clear all
        </button>
      </div>

      {!entries.length && <p class="empty">No scans yet. Scanned codes will appear here.</p>}

      <ul class="entry-list">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} onDelete={onDelete} onNote={onNote} />
        ))}
      </ul>
    </div>
  );
}

function EntryRow({
  entry,
  onDelete,
  onNote
}: {
  entry: ScanEntry;
  onDelete: (id: string) => void;
  onNote: (id: string, note: string) => void;
}) {
  const parsed = parsePayload(entry.code);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? '');
  const [copied, setCopied] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!entry.hasImage) return;
    let url: string | null = null;
    let cancelled = false;
    getImage(entry.id).then((blob) => {
      if (blob && !cancelled) {
        url = URL.createObjectURL(blob);
        setImgUrl(url);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry.id, entry.hasImage]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  }

  return (
    <li class="entry">
      <div class="entry-head">
        <span class={`badge kind-${parsed.kind}`}>{kindLabel(parsed.kind)}</span>
        <span class="format">{formatLabel(entry.format)}</span>
        <span class="spacer" />
        <time>{new Date(entry.timestamp).toLocaleString()}</time>
      </div>

      <ParsedBody parsed={parsed} />

      {imgUrl && <img class="entry-img" src={imgUrl} alt="Captured frame" loading="lazy" />}

      {entry.gps && (
        <a
          class="gps"
          href={`https://www.openstreetmap.org/?mlat=${entry.gps.lat}&mlon=${entry.gps.lng}#map=18/${entry.gps.lat}/${entry.gps.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          📍 {entry.gps.lat.toFixed(5)}, {entry.gps.lng.toFixed(5)} (±{Math.round(entry.gps.accuracy)}m)
        </a>
      )}

      {editing ? (
        <div class="note-edit">
          <input
            type="text"
            placeholder="Add a note…"
            value={draft}
            onInput={(ev) => setDraft((ev.target as HTMLInputElement).value)}
          />
          <button
            onClick={() => {
              onNote(entry.id, draft.trim());
              setEditing(false);
            }}
          >
            Save
          </button>
        </div>
      ) : (
        entry.note && <div class="note" onClick={() => setEditing(true)}>📝 {entry.note}</div>
      )}

      <div class="entry-actions">
        <button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        {parsed.kind === 'url' && (
          <a class="btn" href={entry.code} target="_blank" rel="noopener noreferrer">
            Open link ↗
          </a>
        )}
        <ParsedActions parsed={parsed} />
        {!editing && (
          <button onClick={() => setEditing(true)}>{entry.note ? 'Edit note' : 'Add note'}</button>
        )}
        <span class="spacer" />
        <button class="danger" onClick={() => onDelete(entry.id)}>Delete</button>
      </div>
    </li>
  );
}
