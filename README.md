# QR & Barcode Scanner — qr.codemonkey.ro

A privacy-first QR and barcode scanner that runs entirely in your browser.

Most barcode-scanner apps on the Android store are ad-infested, over-permissioned,
or outright malicious — and almost all of them wrap the same handful of decoding
libraries. This is the boring, honest alternative: a static web app that scans
codes with your camera, keeps everything **on your device**, and asks for nothing
it doesn't need.

- **No backend.** Pure static HTML + CSS + JS, deployed on Cloudflare Workers (static assets).
- **No accounts, no servers, no analytics, no tracking.** Your scans never leave
  the browser unless you export them yourself.
- **Installable (PWA).** Add to your home screen and it works offline — without
  being a "native app".
- **Many symbologies.** QR, Aztec, Data Matrix, PDF417 (boarding passes), EAN/UPC,
  Code 128/39/93, Codabar, ITF.

## Features

- Continuous camera scanning with a configurable re-scan cooldown (default 2s).
- **Capture** button: decodes a full-resolution still for dense codes
  (boarding-pass PDF417, Aztec) that the live preview can't resolve.
- **Tap-to-focus**, torch toggle, and a **camera picker** that defaults to the
  main autofocus rear lens (see [why this matters](docs/DECISIONS.md#d10--camera-selection-prefer-the-main-rear-autofocus-camera)).
- Scan feedback: vibration + an optional short **sound** + an on-screen toast.
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
2. [ZXing](https://github.com/zxing-js/library) (pure JS, lazy-loaded) as a fallback
   for browsers without the native API.

The native detector is weak on dense codes, so the **Capture** path always decodes
the still with ZXing, trying multiple rotations (a boarding pass held in landscape is
rotated 90°). ZXing is only downloaded when it's actually needed.

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

## Deploy (Cloudflare Workers — static assets)

The repo is connected to Cloudflare's Git builds. It deploys as a **Workers
static-assets** project (not Pages — Cloudflare's "import a repo" flow now creates
Workers builds), configured by [`wrangler.jsonc`](wrangler.jsonc):

- Build command: `npm run build` → output `dist/`
- Deploy command: `npx wrangler deploy` (serves `dist` as static assets, SPA fallback)
- Node pinned to 22 via [`.nvmrc`](.nvmrc); Vite must be ≥ 6 (Cloudflare's build
  auto-config rejects older Vite).

Every push to `main` auto-deploys; `qr.codemonkey.ro` is bound as a custom domain.
HTTPS is automatic. Security/permissions headers live in [`public/_headers`](public/_headers).
See [DECISIONS.md → D9](docs/DECISIONS.md#d9--deployment-cloudflare-workers-static-assets)
for the full story (it was not smooth).

## Tech

Preact + Vite + TypeScript, IndexedDB (`idb`) for storage, `vite-plugin-pwa` for the
service worker and installability. Tiny dependency surface on purpose — it's easier
to trust and to audit.

**Dependencies are pinned to exact versions** (no `^`), with a committed lockfile and
`.npmrc` `save-exact=true`, so builds are fully reproducible. [Dependabot](.github/dependabot.yml)
opens weekly PRs for updates — opt-in and reviewed, never auto-merged.

## License

[Apache-2.0](LICENSE).
