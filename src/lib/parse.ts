// Structured payload parsing. Turns a raw decoded string into a typed object
// with named fields, so the UI can render a proper card and offer the actions
// that actually make sense — always explicit, never auto-executed.
//
// Generic http(s) URLs are deliberately NOT given special parsing: we keep
// showing the raw text + copy. Pure functions only here (no DOM, no Date.now)
// so they're easy to unit-test.

export interface WifiData {
  kind: 'wifi';
  raw: string;
  ssid: string;
  security: string; // WPA | WEP | nopass
  password?: string;
  hidden: boolean;
}
export interface ContactData {
  kind: 'contact';
  raw: string;
  name?: string;
  org?: string;
  title?: string;
  phones: string[];
  emails: string[];
  url?: string;
  address?: string;
}
export interface GeoData {
  kind: 'geo';
  raw: string;
  lat: number;
  lng: number;
  label?: string;
}
export interface EmailData {
  kind: 'email';
  raw: string;
  to: string;
  subject?: string;
  body?: string;
}
export interface PhoneData {
  kind: 'phone';
  raw: string;
  number: string;
}
export interface SmsData {
  kind: 'sms';
  raw: string;
  number: string;
  message?: string;
}
export interface CalendarData {
  kind: 'calendar';
  raw: string;
  summary?: string;
  start?: Date;
  end?: Date;
  allDay: boolean;
  location?: string;
  description?: string;
}
export interface BoardingPassData {
  kind: 'boardingpass';
  raw: string;
  passenger?: string;
  pnr?: string;
  from?: string;
  to?: string;
  flight?: string;
  dayOfYear?: number;
  cabin?: string;
  seat?: string;
  sequence?: string;
  legs: number;
}
export interface SepaData {
  kind: 'sepa';
  raw: string;
  name?: string;
  iban?: string;
  bic?: string;
  amount?: string;
  currency?: string;
  reference?: string;
}
export interface OtpData {
  kind: 'otp';
  raw: string;
  otpType: string; // totp | hotp
  issuer?: string;
  account?: string;
  secret?: string;
  digits?: string;
  period?: string;
  algorithm?: string;
}
export interface UrlData {
  kind: 'url';
  raw: string;
}
export interface TextData {
  kind: 'text';
  raw: string;
}

export type Parsed =
  | WifiData
  | ContactData
  | GeoData
  | EmailData
  | PhoneData
  | SmsData
  | CalendarData
  | BoardingPassData
  | SepaData
  | OtpData
  | UrlData
  | TextData;

export type ParsedKind = Parsed['kind'];

const KIND_LABELS: Record<ParsedKind, string> = {
  wifi: 'Wi-Fi',
  contact: 'Contact',
  geo: 'Location',
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  calendar: 'Event',
  boardingpass: 'Boarding pass',
  sepa: 'Payment',
  otp: '2FA / OTP',
  url: 'Link',
  text: 'Text'
};

export function kindLabel(kind: ParsedKind): string {
  return KIND_LABELS[kind];
}

// ---------- small escaping helpers ----------

function splitUnescaped(s: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      cur += c + s[i + 1];
      i++;
      continue;
    }
    if (c === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// MeCard/Wi-Fi style: backslash escapes a single following char.
function unescapeBackslash(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

// iCalendar/vCard text escaping: \n \, \; \\
function unescapeICalText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeICalText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// ---------- individual parsers ----------

function parseWifi(raw: string): WifiData {
  const content = raw.replace(/^WIFI:/i, '');
  const map: Record<string, string> = {};
  for (const token of splitUnescaped(content, ';')) {
    if (!token) continue;
    const idx = token.indexOf(':');
    if (idx < 0) continue;
    const key = token.slice(0, idx).toUpperCase();
    map[key] = unescapeBackslash(token.slice(idx + 1));
  }
  const security = (map.T || 'nopass').toUpperCase();
  return {
    kind: 'wifi',
    raw,
    ssid: map.S ?? '',
    security: security === '' ? 'nopass' : security,
    password: map.P || undefined,
    hidden: (map.H || '').toLowerCase() === 'true'
  };
}

function parseMeCard(raw: string): ContactData {
  const content = raw.replace(/^MECARD:/i, '');
  const phones: string[] = [];
  const emails: string[] = [];
  let name: string | undefined;
  let org: string | undefined;
  let url: string | undefined;
  let address: string | undefined;
  for (const token of splitUnescaped(content, ';')) {
    if (!token) continue;
    const idx = token.indexOf(':');
    if (idx < 0) continue;
    const key = token.slice(0, idx).toUpperCase();
    const val = unescapeBackslash(token.slice(idx + 1));
    if (!val) continue;
    if (key === 'N') {
      // "Surname,Given" -> "Given Surname"
      const [surname, given] = val.split(',');
      name = given ? `${given} ${surname}`.trim() : val;
    } else if (key === 'TEL') phones.push(val);
    else if (key === 'EMAIL') emails.push(val);
    else if (key === 'ORG') org = val;
    else if (key === 'URL') url = val;
    else if (key === 'ADR') address = val;
  }
  return { kind: 'contact', raw, name, org, phones, emails, url, address };
}

function parseVCard(raw: string): ContactData {
  // Unfold folded lines (continuation lines start with space or tab).
  const unfolded = raw.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const phones: string[] = [];
  const emails: string[] = [];
  let fn: string | undefined;
  let n: string | undefined;
  let org: string | undefined;
  let title: string | undefined;
  let url: string | undefined;
  let address: string | undefined;
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const namePart = line.slice(0, idx);
    const value = unescapeICalText(line.slice(idx + 1));
    const prop = namePart.split(';')[0].toUpperCase();
    if (prop === 'FN') fn = value;
    else if (prop === 'N') {
      const [family, given] = value.split(';');
      n = [given, family].filter(Boolean).join(' ').trim() || value;
    } else if (prop === 'TEL') phones.push(value);
    else if (prop === 'EMAIL') emails.push(value);
    else if (prop === 'ORG') org = value.split(';').filter(Boolean).join(', ');
    else if (prop === 'TITLE') title = value;
    else if (prop === 'URL') url = value;
    else if (prop === 'ADR')
      address = value.split(';').filter(Boolean).join(', ') || undefined;
  }
  return { kind: 'contact', raw, name: fn || n, org, title, phones, emails, url, address };
}

/** Parse an iCalendar timestamp: YYYYMMDD or YYYYMMDDTHHMMSS[Z]. */
export function parseICalDate(v: string): { date: Date; allDay: boolean } | null {
  const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) {
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  }
  if (z) {
    return {
      date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))),
      allDay: false
    };
  }
  return {
    date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    allDay: false
  };
}

function parseCalendar(raw: string): CalendarData {
  const unfolded = raw.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  let summary: string | undefined;
  let location: string | undefined;
  let description: string | undefined;
  let start: Date | undefined;
  let end: Date | undefined;
  let allDay = false;
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const prop = line.slice(0, idx).split(';')[0].toUpperCase();
    const value = line.slice(idx + 1);
    if (prop === 'SUMMARY') summary = unescapeICalText(value);
    else if (prop === 'LOCATION') location = unescapeICalText(value);
    else if (prop === 'DESCRIPTION') description = unescapeICalText(value);
    else if (prop === 'DTSTART') {
      const p = parseICalDate(value);
      if (p) {
        start = p.date;
        allDay = p.allDay;
      }
    } else if (prop === 'DTEND') {
      const p = parseICalDate(value);
      if (p) end = p.date;
    }
  }
  return { kind: 'calendar', raw, summary, start, end, allDay, location, description };
}

function parseGeo(raw: string): GeoData | TextData {
  const rest = raw.replace(/^geo:/i, '');
  const [coords, query] = rest.split('?');
  const [latStr, lngStr] = coords.split(',');
  const lat = Number.parseFloat(latStr);
  const lng = Number.parseFloat(lngStr);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { kind: 'text', raw };
  let label: string | undefined;
  if (query) {
    const q = new URLSearchParams(query).get('q');
    if (q) label = q;
  }
  return { kind: 'geo', raw, lat, lng, label };
}

function parseMailto(raw: string): EmailData {
  const rest = raw.replace(/^mailto:/i, '');
  const [addr, qs] = rest.split('?');
  const params = new URLSearchParams(qs || '');
  return {
    kind: 'email',
    raw,
    to: safeDecode(addr),
    subject: params.get('subject') || undefined,
    body: params.get('body') || undefined
  };
}

function parseSms(raw: string): SmsData {
  if (/^smsto:/i.test(raw)) {
    const rest = raw.replace(/^smsto:/i, '');
    const idx = rest.indexOf(':');
    return {
      kind: 'sms',
      raw,
      number: (idx >= 0 ? rest.slice(0, idx) : rest).trim(),
      message: idx >= 0 ? rest.slice(idx + 1) : undefined
    };
  }
  const rest = raw.replace(/^sms:/i, '');
  const [num, qs] = rest.split('?');
  return {
    kind: 'sms',
    raw,
    number: num.trim(),
    message: new URLSearchParams(qs || '').get('body') || undefined
  };
}

function parseOtp(raw: string): OtpData | TextData {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'text', raw };
  }
  const label = safeDecode(url.pathname.replace(/^\//, ''));
  const params = url.searchParams;
  let issuer = params.get('issuer') || undefined;
  let account = label;
  if (label.includes(':')) {
    const [iss, ...rest] = label.split(':');
    if (!issuer) issuer = iss.trim();
    account = rest.join(':').trim();
  }
  return {
    kind: 'otp',
    raw,
    otpType: (url.host || url.hostname || 'totp').toLowerCase(),
    issuer,
    account: account || undefined,
    secret: params.get('secret') || undefined,
    digits: params.get('digits') || undefined,
    period: params.get('period') || undefined,
    algorithm: params.get('algorithm') || undefined
  };
}

function parseSepa(raw: string): SepaData | TextData {
  const lines = raw.split(/\r?\n/);
  if ((lines[0] || '').trim() !== 'BCD') return { kind: 'text', raw };
  const amountRaw = (lines[7] || '').trim();
  const hasAmount = amountRaw.length > 3;
  return {
    kind: 'sepa',
    raw,
    bic: (lines[4] || '').trim() || undefined,
    name: (lines[5] || '').trim() || undefined,
    iban: (lines[6] || '').trim() || undefined,
    currency: hasAmount ? amountRaw.slice(0, 3) : undefined,
    amount: hasAmount ? amountRaw.slice(3) : undefined,
    reference: (lines[9] || '').trim() || (lines[10] || '').trim() || undefined
  };
}

function looksLikeBoardingPass(v: string): boolean {
  // IATA BCBP "M" format: 'M', leg count digit, >=60 mandatory chars, and
  // 3-letter from/to airport codes at their fixed offsets.
  if (!/^M[1-9]/.test(v) || v.length < 60) return false;
  return /^[A-Z]{3}$/.test(v.slice(30, 33)) && /^[A-Z]{3}$/.test(v.slice(33, 36));
}

function parseBoardingPass(v: string): BoardingPassData {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
  const nameRaw = clean(v.slice(2, 22));
  let passenger = nameRaw;
  if (nameRaw.includes('/')) {
    const [surname, given] = nameRaw.split('/');
    passenger = `${clean(given)} ${clean(surname)}`.trim();
  }
  const carrier = clean(v.slice(36, 39));
  const flightNo = clean(v.slice(39, 44));
  const julian = clean(v.slice(44, 47));
  const dayOfYear = /^\d{1,3}$/.test(julian) ? Number(julian) : undefined;
  return {
    kind: 'boardingpass',
    raw: v,
    legs: Number(v[1]),
    passenger: passenger || undefined,
    pnr: clean(v.slice(23, 30)) || undefined,
    from: clean(v.slice(30, 33)) || undefined,
    to: clean(v.slice(33, 36)) || undefined,
    flight: [carrier, flightNo].filter(Boolean).join(' ') || undefined,
    dayOfYear,
    cabin: clean(v.slice(47, 48)) || undefined,
    seat: clean(v.slice(48, 52)) || undefined,
    sequence: clean(v.slice(52, 57)) || undefined
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------- dispatcher ----------

export function parsePayload(raw: string): Parsed {
  const v = raw.trim();
  const lower = v.toLowerCase();
  try {
    if (lower.startsWith('wifi:')) return parseWifi(v);
    if (lower.startsWith('begin:vcard')) return parseVCard(v);
    if (lower.startsWith('mecard:')) return parseMeCard(v);
    if (lower.startsWith('begin:vcalendar') || lower.startsWith('begin:vevent'))
      return parseCalendar(v);
    if (lower.startsWith('otpauth://')) return parseOtp(v);
    if (lower.startsWith('geo:')) return parseGeo(v);
    if (lower.startsWith('mailto:')) return parseMailto(v);
    if (lower.startsWith('tel:')) return { kind: 'phone', raw: v, number: v.slice(4).trim() };
    if (lower.startsWith('smsto:') || lower.startsWith('sms:')) return parseSms(v);
    if (v.startsWith('BCD\n') || v.startsWith('BCD\r\n')) return parseSepa(v);
    if (looksLikeBoardingPass(v)) return parseBoardingPass(v);
    if (/^https?:\/\//i.test(v)) return { kind: 'url', raw: v };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: 'email', raw: v, to: v };
  } catch {
    /* any parser failure falls through to plain text */
  }
  return { kind: 'text', raw: v };
}

// ---------- file builders (for "add to contacts/calendar") ----------

export function toVCard(c: ContactData): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (c.name) lines.push(`FN:${escapeICalText(c.name)}`);
  if (c.org) lines.push(`ORG:${escapeICalText(c.org)}`);
  if (c.title) lines.push(`TITLE:${escapeICalText(c.title)}`);
  for (const tel of c.phones) lines.push(`TEL:${escapeICalText(tel)}`);
  for (const email of c.emails) lines.push(`EMAIL:${escapeICalText(email)}`);
  if (c.url) lines.push(`URL:${escapeICalText(c.url)}`);
  if (c.address) lines.push(`ADR:;;${escapeICalText(c.address)};;;;`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

function formatICalUTC(d: Date, allDay: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0');
  if (allDay) {
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

export function toICS(e: CalendarData): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//qr.codemonkey.ro//Scanner//EN',
    'BEGIN:VEVENT'
  ];
  const uidBase = e.start ? formatICalUTC(e.start, e.allDay) : 'event';
  lines.push(`UID:${uidBase}-${escapeICalText(e.summary || 'event')}@qr.codemonkey.ro`);
  if (e.start) lines.push(`DTSTART:${formatICalUTC(e.start, e.allDay)}`);
  if (e.end) lines.push(`DTEND:${formatICalUTC(e.end, e.allDay)}`);
  if (e.summary) lines.push(`SUMMARY:${escapeICalText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${escapeICalText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeICalText(e.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
