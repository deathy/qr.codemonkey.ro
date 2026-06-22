# Decisions

Lightweight architecture decision records. Newest considerations at the bottom of
each section. These capture *why*, so future-us (and contributors) don't re-litigate.

## Guiding principle

The whole reason this exists is that the alternatives are untrustworthy. So every
decision is weighed against: **does this keep the app trustworthy, auditable, and
fully on-device?** A small dependency surface and "no data leaves the browser" are
features, not incidentals.

## D1 — Pure static, no backend

- **Decision:** Pure static HTML/CSS/JS, deployed to Cloudflare Pages.
- **Why:** No server means nothing to hack, nothing to host long-term, no data
  custody. Camera/GPS already require HTTPS, which Pages provides for free.

## D2 — Scanning engine: native `BarcodeDetector` first, ZXing fallback

- **Decision:** Use the browser's native `BarcodeDetector` API when present;
  fall back to `@zxing/library` + `@zxing/browser` otherwise.
- **Why:** The primary device is an Android Samsung Galaxy S24 on Chrome, where
  `BarcodeDetector` is available, hardware-accelerated, and needs zero download.
  ZXing covers desktop Firefox / anything without the native API.
- **Why not zbar:** zbar (what most of the spammy apps use) is weak at PDF417 and
  Aztec — exactly what boarding passes need. ZXing handles them. ZXing is also
  Apache-2.0, matching our license cleanly.
- **Consequence:** We own the `MediaStream` ourselves (not delegated to ZXing) so
  torch control and frame capture behave identically on both paths.
- **Open risk:** Real-world `BarcodeDetector` accuracy on trickier formats
  (PDF417 boarding pass, Aztec, Data Matrix) on the S24 is unverified — validate
  with the physical test sheets before relying on it.

## D3 — Frontend: Preact + Vite + TypeScript

- **Decision:** Preact (not React, Svelte, or vanilla).
- **Why:** Tiny (~3KB) React-like component model; familiar JSX; small bundle that
  fits the "minimal and auditable" goal. TypeScript because the author is a Java
  dev who values static typing.

## D4 — Storage: IndexedDB (not localStorage)

- **Decision:** IndexedDB via the `idb` wrapper. Two stores: `entries` (metadata)
  and `images` (frame blobs keyed by entry id).
- **Why:** The "save camera frame" option stores JPEG blobs, which would blow past
  localStorage's ~5MB cap almost immediately. Settings (small, simple) stay in
  localStorage.

## D5 — PWA / installable

- **Decision:** `vite-plugin-pwa` with an autoUpdate service worker and a web
  manifest, installable to the home screen, offline-capable.
- **Why:** Directly answers the "feels native, isn't a native app" goal. The icon
  is currently an inline SVG; swap in PNG icons before a public launch.

## D6 — Data model & export

- **Decision:** Each scan is an immutable record: `id, code, format, timestamp`,
  plus optional `note` (the only mutable field), `gps`, and `hasImage`. Same code
  scanned again = a new timestamped record (deduping is only a per-payload
  *cooldown*, never a merge). Export is JSON with images inlined as data URLs so
  the file is self-contained. See `EXPORT_VERSION` in `src/lib/types.ts`.
- **Why:** Keeping every scan with its timestamp matches the inventory/diary use
  case; the cooldown just stops a held-still product from logging in a loop.
- **Deferred:** Import, CSV export.

## D7 — Privacy posture

- **Decision:** GPS and image capture default **off**, opt-in, clearly labelled.
  Links are shown in full and never auto-opened. No analytics.
- **Why:** This is the product's entire reason to exist.
- **Future:** If analytics are ever added, PostHog (privacy-respecting / cookieless
  config) is the intended choice — but not in the MVP.

## D8 — License: Apache-2.0

- **Decision:** Apache-2.0.
- **Why:** Author preference; includes a patent grant; matches ZXing's license.
