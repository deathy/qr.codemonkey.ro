# Decisions

Lightweight architecture decision records. Newest considerations at the bottom of
each section. These capture *why*, so future-us (and contributors) don't re-litigate.

## Guiding principle

The whole reason this exists is that the alternatives are untrustworthy. So every
decision is weighed against: **does this keep the app trustworthy, auditable, and
fully on-device?** A small dependency surface and "no data leaves the browser" are
features, not incidentals.

## D1 — Pure static, no backend

- **Decision:** Pure static HTML/CSS/JS, no server-side code.
- **Why:** No server means nothing to hack, nothing to host long-term, no data
  custody. Camera/GPS already require HTTPS, which the host provides for free.
- **Update:** Originally intended for Cloudflare Pages; we ended up on Cloudflare
  **Workers static assets** instead — see [D9](#d9--deployment-cloudflare-workers-static-assets).

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
  torch control and frame capture behave identically on both paths. ZXing is
  lazy-loaded (dynamic import) so the native path never downloads it.
- **Resolved (was an open risk):** On the S24, native `BarcodeDetector` handles QR
  and 1D (EAN/UPC/Code128) well, but is **weak on PDF417** even from a sharp image.
  Two things fixed boarding passes: (a) fixing focus — see [D10](#d10--camera-selection-prefer-the-main-rear-autofocus-camera)
  — and (b) the **Capture** still-decode path that routes through ZXing across
  rotations — see [D11](#d11--capture-button-for-dense-codes). The biggest real-world
  blocker turned out to be *focus*, not the decoder.

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
- **Why:** Directly answers the "feels native, isn't a native app" goal.
- **Icon:** The app icon **is a QR code that points to `https://qr.codemonkey.ro`** —
  self-referential and literally true (scan the icon → open the app). Generated from
  the URL via `npm run icons` (`scripts/generate-icons.mjs`, dark modules on white for
  universal scannability): `favicon.svg` + PNG `icon-192/512` (any) + `icon-maskable-512`
  (extra quiet zone so masking can't clip a finder pattern).

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

## D9 — Deployment: Cloudflare Workers (static assets)

- **Decision:** Deploy as a **Workers static-assets** project via Cloudflare's
  Git-connected builds, configured by an explicit `wrangler.jsonc` (assets dir
  `./dist`, SPA fallback). Build = `npm run build`, deploy = `npx wrangler deploy`.
- **Why (and the saga):** We intended Cloudflare Pages, but the dashboard's "import
  a Git repo" flow now creates **Workers Builds**, not Pages. That flow auto-detects
  Vite and **injects `@cloudflare/vite-plugin`**, which imports `node:module`'s
  `registerHooks` (Node ≥ 22.15 only) and exploded the build on Node 20. A static SPA
  needs none of that. Providing an explicit `wrangler.jsonc` stops the auto-config from
  guessing, so the build is just our plain Vite build serving `dist`.
- **Constraints learned the hard way:**
  - Cloudflare's build auto-config **rejects Vite < 6** → we upgraded Vite 5 → 6
    (and later 6 → **8** to stay on a supported major; ≥ 6 remains the hard floor).
  - Build-time Node pinned to **22** via `.nvmrc`.
  - The `wrangler.jsonc` `name` **must match** the Worker Cloudflare created from the
    repo (`qr-codemonkey-ro`), or the CI warns and opens a fixup PR.
- **Headers:** `public/_headers` sets `Permissions-Policy: camera=(self),
  geolocation=(self)` (required for the features) plus `no-referrer`, `nosniff`,
  `X-Frame-Options: DENY`.

## D10 — Camera selection: prefer the main rear (autofocus) camera

- **Decision:** Don't rely on `facingMode: environment`. Enumerate video inputs and
  pick the **lowest-indexed rear camera** ("camera 0, facing back" = the main lens),
  with a user-overridable picker in Settings and a persisted `cameraId`.
- **Why (the biggest single lesson):** On the S24, `facingMode: environment` selected
  **"camera 2, facing back"**, whose only `focusMode` capability is `["manual"]` —
  locked at infinity. That made everything close blurry and made continuous-AF and
  tap-to-focus no-ops, which looked like decoder failures but wasn't. The main camera
  (index 0) has real autofocus; once selected, native scanning (including PDF417)
  works. Camera **0** is conventionally the primary rear lens on Android.
- **Supporting bits:** continuous AF + tap-to-focus (`pointsOfInterest` / single-shot)
  applied when supported; 1080p requested for sharper small codes; a **Camera
  diagnostics** panel in the Scan view exposes the selected label, capabilities,
  focus status, and device list — invaluable for debugging this remotely.

## D11 — Capture button for dense codes

- **Decision:** A manual **Capture** shutter grabs a full-resolution still via
  `ImageCapture.takePhoto()` (autofocused, sensor-res; falls back to `grabFrame`, then
  the video frame) and decodes it with **ZXing, trying 0/90/270/180°**.
- **Why:** The live preview is too soft for PDF417/Aztec; a crisp still decodes
  reliably. ZXing's PDF417/Aztec readers beat the native detector but are
  orientation-sensitive, hence the rotation sweep. Native `scanStill` tries the native
  detector first, then falls back to ZXing.

## D12 — Scan feedback is decoupled from persistence

- **Decision:** The instant a scan is accepted, fire **vibrate + sound + toast**
  synchronously; then persist (GPS fix, optional frame, IndexedDB write) in the
  background via `recordScan`.
- **Why:** Originally feedback was interleaved with the save — the toast came *after*
  `await getLocation()`. With GPS always on, a slow fix meant you'd feel the vibration
  but see no toast, even though the scan did save. Feedback must never wait on the
  (variable-latency) save path.
- **Related:** Default re-scan cooldown is **2s**. Scan **sound** is a tiny
  synthesized Web Audio blip (no asset), default on, toggleable, unlocked on first
  user gesture (autoplay policy).

## D13 — Dependencies pinned exact + Dependabot

- **Decision:** All direct deps pinned to **exact versions** (no `^`); `.npmrc`
  `save-exact=true`; committed lockfile; builds use `npm ci`. Dependabot opens
  **weekly PRs** (minor/patch grouped, majors individual) — opt-in, never auto-merged.
- **Why:** Reproducible deploys with no ambient drift. The lockfile is the real
  guarantee (it pins transitive deps too); exact `package.json` + `.npmrc` prevent
  accidental widening. Updates become a deliberate, reviewable act.
- **Lessons from the first update batch:**
  - **Verify with `npm ci`, not `npm install`.** Cloudflare uses `npm ci`, which fails
    hard on peer-dep conflicts that a local `npm install` silently papers over.
  - **Grouped PRs can produce invalid combos.** Dependabot's minor/patch group bumped
    `@zxing/library` to 0.23.0 while `@zxing/browser@0.2.0` peer-requires `^0.22.0` —
    `npm ci` rejected it. Fix was to pin the library to the compatible 0.22.0.
  - **Merge majors one at a time and verify on-device between each** (especially
    anything touching scanning or the service worker), rather than in a batch.

## D14 — Build version stamp

- **Decision:** Inject the short commit SHA + build time (Vite `define`, from
  Cloudflare's CI env var with a git fallback) and show them at the bottom of Settings,
  linked to the GitHub commit.
- **Why:** The PWA service worker caches aggressively; the stamp makes it trivial to
  confirm whether the deployed version is current after an update.

## D15 — Structured payload parsing

- **Decision:** Parse known payload types into typed objects and render a per-type
  card with the **one or two actions that actually make sense**, always explicit.
  Covered: Wi-Fi, contact (vCard/MeCard), geo, email, phone, SMS, calendar (vEvent),
  boarding pass (IATA BCBP), SEPA (EPC), and `otpauth` (2FA). Logic lives in
  `src/lib/parse.ts` as **pure functions**, unit-tested with Vitest.
- **Generic URLs deliberately excluded:** we keep showing the raw URL + copy (and the
  existing explicit "Open link"). A URL "safety" view (punycode/homograph flags etc.)
  is high-effort and risks giving false confidence — not worth it.
- **Real actions, still no backend:** "Add to contacts" / "Add to calendar" generate a
  `.vcf` / `.ics` **locally** and hand it to the OS via a download — native-feeling,
  zero server. Maps/email/phone/SMS use standard URI schemes (explicit tap).
  Wi-Fi can't be joined from the web, so we present + copy the credentials instead.
- **Sensitive fields masked:** Wi-Fi passwords and OTP secrets are hidden behind a
  reveal toggle; SEPA shows a "verify before paying" note. Crypto/payment-initiation
  payloads are intentionally not supported.
- **Test hygiene:** parser tests use only fictional/public data — made-up names,
  reserved `555` numbers, `example.com`, the canonical public example IBAN, the RFC
  OTP test secret; real airport codes are fine (public).
