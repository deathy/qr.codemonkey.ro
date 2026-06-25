import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { type Parsed, toVCard, toICS } from '../lib/parse';
import { downloadText } from '../lib/download';

// Renders the structured fields of a parsed payload (the "body"), and a
// separate set of type-specific action buttons. URLs and plain text fall back
// to showing the raw value — no special handling, by design.

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <span class="field-value">{children}</span>
    </div>
  );
}

function Secret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span class="secret">
      <code>{shown ? value : '•'.repeat(Math.min(value.length, 12))}</code>
      <button class="link-btn" onClick={() => setShown((s) => !s)}>
        {shown ? 'hide' : 'show'}
      </button>
    </span>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked; ignore */
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

function dayOfYearLabel(day: number): string {
  const year = new Date().getFullYear();
  const d = new Date(year, 0, day);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} (day ${day}, year not encoded)`;
}

function whenLabel(p: { start?: Date; end?: Date; allDay: boolean }): string {
  if (!p.start) return '';
  const opts: Intl.DateTimeFormatOptions = p.allDay
    ? { dateStyle: 'medium' }
    : { dateStyle: 'medium', timeStyle: 'short' };
  const start = p.start.toLocaleString(undefined, opts);
  const end = p.end ? p.end.toLocaleString(undefined, opts) : '';
  return end ? `${start} → ${end}` : start;
}

export function ParsedBody({ parsed }: { parsed: Parsed }) {
  switch (parsed.kind) {
    case 'wifi':
      return (
        <div class="parsed">
          <Field label="Network">{parsed.ssid || '(unnamed)'}</Field>
          <Field label="Security">{parsed.security}</Field>
          {parsed.password && (
            <Field label="Password">
              <Secret value={parsed.password} />
            </Field>
          )}
          {parsed.hidden && <Field label="Hidden">yes</Field>}
        </div>
      );
    case 'contact':
      return (
        <div class="parsed">
          {parsed.name && <Field label="Name">{parsed.name}</Field>}
          {(parsed.title || parsed.org) && (
            <Field label="Org">{[parsed.title, parsed.org].filter(Boolean).join(', ')}</Field>
          )}
          {parsed.phones.map((t, i) => (
            <Field key={`tel${i}`} label="Phone">
              <a href={`tel:${t}`}>{t}</a>
            </Field>
          ))}
          {parsed.emails.map((e, i) => (
            <Field key={`mail${i}`} label="Email">
              <a href={`mailto:${e}`}>{e}</a>
            </Field>
          ))}
          {parsed.address && <Field label="Address">{parsed.address}</Field>}
          {parsed.url && <Field label="URL">{parsed.url}</Field>}
        </div>
      );
    case 'geo':
      return (
        <div class="parsed">
          {parsed.label && <Field label="Place">{parsed.label}</Field>}
          <Field label="Coords">
            {parsed.lat.toFixed(5)}, {parsed.lng.toFixed(5)}
          </Field>
        </div>
      );
    case 'email':
      return (
        <div class="parsed">
          <Field label="To">{parsed.to}</Field>
          {parsed.subject && <Field label="Subject">{parsed.subject}</Field>}
          {parsed.body && <Field label="Body">{parsed.body}</Field>}
        </div>
      );
    case 'phone':
      return (
        <div class="parsed">
          <Field label="Number">{parsed.number}</Field>
        </div>
      );
    case 'sms':
      return (
        <div class="parsed">
          <Field label="Number">{parsed.number}</Field>
          {parsed.message && <Field label="Message">{parsed.message}</Field>}
        </div>
      );
    case 'calendar':
      return (
        <div class="parsed">
          {parsed.summary && <Field label="Event">{parsed.summary}</Field>}
          {parsed.start && <Field label="When">{whenLabel(parsed)}</Field>}
          {parsed.location && <Field label="Where">{parsed.location}</Field>}
          {parsed.description && <Field label="Notes">{parsed.description}</Field>}
        </div>
      );
    case 'boardingpass':
      return (
        <div class="parsed">
          {parsed.passenger && <Field label="Passenger">{parsed.passenger}</Field>}
          {(parsed.from || parsed.to) && (
            <Field label="Route">
              {parsed.from} → {parsed.to}
            </Field>
          )}
          {parsed.flight && <Field label="Flight">{parsed.flight}</Field>}
          {parsed.dayOfYear !== undefined && (
            <Field label="Date">{dayOfYearLabel(parsed.dayOfYear)}</Field>
          )}
          {parsed.seat && <Field label="Seat">{parsed.seat}</Field>}
          {parsed.pnr && <Field label="Booking">{parsed.pnr}</Field>}
          {parsed.legs > 1 && <Field label="Legs">{parsed.legs} (showing first)</Field>}
        </div>
      );
    case 'sepa':
      return (
        <div class="parsed">
          {parsed.name && <Field label="Payee">{parsed.name}</Field>}
          {parsed.iban && <Field label="IBAN">{parsed.iban}</Field>}
          {parsed.amount && (
            <Field label="Amount">
              {parsed.amount} {parsed.currency}
            </Field>
          )}
          {parsed.reference && <Field label="Reference">{parsed.reference}</Field>}
          {parsed.bic && <Field label="BIC">{parsed.bic}</Field>}
          <p class="parsed-warn">Always verify payee and IBAN before paying anyone.</p>
        </div>
      );
    case 'otp':
      return (
        <div class="parsed">
          {parsed.issuer && <Field label="Issuer">{parsed.issuer}</Field>}
          {parsed.account && <Field label="Account">{parsed.account}</Field>}
          {parsed.secret && (
            <Field label="Secret">
              <Secret value={parsed.secret} />
            </Field>
          )}
          <p class="parsed-warn">This is a 2FA setup secret — keep it private.</p>
        </div>
      );
    default:
      // url / text: show the raw value, monospace.
      return <div class="entry-code">{parsed.raw}</div>;
  }
}

export function ParsedActions({ parsed }: { parsed: Parsed }) {
  switch (parsed.kind) {
    case 'wifi':
      return (
        <>
          {parsed.ssid && <CopyButton label="Copy SSID" value={parsed.ssid} />}
          {parsed.password && <CopyButton label="Copy password" value={parsed.password} />}
        </>
      );
    case 'contact':
      return (
        <button
          onClick={() =>
            downloadText(
              `${(parsed.name || 'contact').replace(/[^\w-]+/g, '_')}.vcf`,
              'text/vcard',
              toVCard(parsed)
            )
          }
        >
          Add to contacts
        </button>
      );
    case 'geo':
      return (
        <a class="btn" href={osmLink(parsed.lat, parsed.lng)} target="_blank" rel="noopener noreferrer">
          Open in maps ↗
        </a>
      );
    case 'email':
      return (
        <a class="btn" href={parsed.raw}>
          Compose email
        </a>
      );
    case 'phone':
      return (
        <a class="btn" href={`tel:${parsed.number}`}>
          Call
        </a>
      );
    case 'sms':
      return (
        <a
          class="btn"
          href={`sms:${parsed.number}${parsed.message ? `?body=${encodeURIComponent(parsed.message)}` : ''}`}
        >
          Send SMS
        </a>
      );
    case 'calendar':
      return (
        <button
          onClick={() =>
            downloadText(
              `${(parsed.summary || 'event').replace(/[^\w-]+/g, '_')}.ics`,
              'text/calendar',
              toICS(parsed)
            )
          }
        >
          Add to calendar
        </button>
      );
    case 'sepa':
      return parsed.iban ? <CopyButton label="Copy IBAN" value={parsed.iban} /> : null;
    case 'otp':
      return parsed.secret ? <CopyButton label="Copy secret" value={parsed.secret} /> : null;
    default:
      return null;
  }
}
