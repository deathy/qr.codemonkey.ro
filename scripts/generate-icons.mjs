// Generates the app icons from a QR code of the app's own URL — the icon IS a
// scannable code that opens the app. Run with `npm run icons`. Build-time only;
// the generated files in public/ are committed.
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL = 'https://qr.codemonkey.ro';
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Dark modules on white for universal scannability (inverted QR isn't read by
// every scanner). White background also masks cleanly on a home screen.
const color = { dark: '#0f172aff', light: '#ffffffff' };
const errorCorrectionLevel = 'M';

const svg = await QRCode.toString(URL, { type: 'svg', margin: 2, color, errorCorrectionLevel });
writeFileSync(join(publicDir, 'favicon.svg'), svg);

// "any"-purpose icons: small quiet zone, QR fills most of the tile.
for (const size of [192, 512]) {
  const png = await QRCode.toBuffer(URL, { type: 'png', width: size, margin: 3, color, errorCorrectionLevel });
  writeFileSync(join(publicDir, `icon-${size}.png`), png);
}

// Maskable: generous quiet zone so the OS mask (circle/squircle) can never clip
// a finder pattern — the white field absorbs the crop, the QR stays intact.
const maskable = await QRCode.toBuffer(URL, { type: 'png', width: 512, margin: 7, color, errorCorrectionLevel });
writeFileSync(join(publicDir, 'icon-maskable-512.png'), maskable);

console.log(`Generated icons from ${URL} into public/`);
