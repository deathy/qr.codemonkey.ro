// Lightweight classification of a decoded payload so the UI can offer the
// right action. We deliberately do NOT act on anything automatically — opening
// a URL always requires an explicit tap, with the full destination shown.

export type ContentKind = 'url' | 'email' | 'phone' | 'wifi' | 'geo' | 'vcard' | 'text';

export interface ClassifiedContent {
  kind: ContentKind;
  /** Human label for the kind. */
  label: string;
  /** The raw payload, unchanged. */
  raw: string;
}

export function classify(raw: string): ClassifiedContent {
  const v = raw.trim();
  const lower = v.toLowerCase();

  if (/^https?:\/\//i.test(v)) return { kind: 'url', label: 'Link', raw };
  if (lower.startsWith('mailto:') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    return { kind: 'email', label: 'Email', raw };
  if (lower.startsWith('tel:') || lower.startsWith('smsto:'))
    return { kind: 'phone', label: 'Phone', raw };
  if (lower.startsWith('wifi:')) return { kind: 'wifi', label: 'Wi-Fi', raw };
  if (lower.startsWith('geo:')) return { kind: 'geo', label: 'Location', raw };
  if (lower.startsWith('begin:vcard') || lower.startsWith('mecard:'))
    return { kind: 'vcard', label: 'Contact', raw };

  return { kind: 'text', label: 'Text', raw };
}

/** Pretty, human-readable name for a symbology code. */
export function formatLabel(format: string): string {
  const map: Record<string, string> = {
    qr_code: 'QR Code',
    aztec: 'Aztec',
    data_matrix: 'Data Matrix',
    pdf417: 'PDF417',
    ean_13: 'EAN-13',
    ean_8: 'EAN-8',
    upc_a: 'UPC-A',
    upc_e: 'UPC-E',
    code_128: 'Code 128',
    code_39: 'Code 39',
    code_93: 'Code 93',
    codabar: 'Codabar',
    itf: 'ITF'
  };
  return map[format] ?? format;
}
