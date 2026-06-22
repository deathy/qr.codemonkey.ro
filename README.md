# QR & Barcode Scanner — qr.codemonkey.ro

A privacy-first QR and barcode scanner that runs entirely in your browser.

Most barcode-scanner apps on the Android store are ad-infested, over-permissioned,
or outright malicious — and almost all of them wrap the same handful of decoding
libraries. This is the boring, honest alternative: a static web app that scans
codes with your camera, keeps everything **on your device**, and asks for nothing
it doesn't need.

- **No backend.** Pure static HTML + CSS + JS, deployable to Cloudflare Pages.
- **No accounts, no servers, no analytics, no tracking.** Your scans never leave
  the browser unless you export them yourself.
- **Installable (PWA).** Add to your home screen and it works offline — without
  being a "native app".
- **Many symbologies.** QR, Aztec, Data Matrix, PDF417 (boarding passes), EAN/UPC,
  Code 128/39/93, Codabar, ITF.

## Features (MVP)

- Continuous camera scanning with a configurable re-scan cooldown.
- Local, timestamped history of every scan; add notes, delete entries.
- Content-aware actions — links are shown in full and **never opened automatically**.
- Optional **GPS location** capture per scan (off by default).
- Optional **camera frame** capture per scan (off by default).
- **Export everything to JSON** (images inlined as data URLs; self-contained).

## How it scans

A hybrid engine, chosen at runtime:

1. The browser's native [`BarcodeDetector` API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)
   when available (Android Chrome — the primary target). Fast, hardware-accelerated,
   zero download.
2. [ZXing](https://github.com/zxing-js/library) (pure JS) as a fallback for browsers
   without the native API.

See [docs/DECISIONS.md](docs/DECISIONS.md) for the reasoning behind these choices and
[docs/ROADMAP.md](docs/ROADMAP.md) for what's planned.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173  (camera works on localhost)
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build locally
```

> **Camera + GPS need a secure context (HTTPS).** `localhost` counts as secure, so
> desktop dev works. To test on your **phone**, plain LAN HTTP will *not* grant the
> camera — deploy to the live site, or expose dev over HTTPS with a tunnel
> (e.g. `cloudflared tunnel --url http://localhost:5173`).

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Build output directory: `dist`
- Framework preset: none / Vite

Point `qr.codemonkey.ro` at the Pages project. HTTPS is automatic.

## Tech

Preact + Vite + TypeScript, IndexedDB for storage, `vite-plugin-pwa` for the
service worker and installability. Tiny dependency surface on purpose — it's easier
to trust, and easier to audit.

## License

[Apache-2.0](LICENSE).
