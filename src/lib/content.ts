// Symbology label helper. Payload interpretation lives in parse.ts.

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
