# Roadmap

Phased, so the app is useful early and stays focused. Checkboxes track the MVP.

## Phase 1 — MVP (current)

- [x] Hybrid scanning engine (native `BarcodeDetector` + ZXing fallback)
- [x] Continuous scanning with per-payload re-scan cooldown
- [x] Local timestamped history (IndexedDB)
- [x] Per-entry notes; delete; clear all
- [x] Content classification (URL / email / phone / Wi-Fi / geo / contact / text)
- [x] Links shown in full, opened only on explicit tap
- [x] Optional GPS capture (off by default)
- [x] Optional camera-frame capture (off by default)
- [x] JSON export (self-contained, images inlined)
- [x] PWA: installable + offline
- [ ] Validate decode accuracy on real test sheets (S24 / Chrome), esp. PDF417 & Aztec
- [ ] Replace SVG app icon with proper PNG icons (192 / 512 / maskable)
- [ ] Deploy to Cloudflare Pages on qr.codemonkey.ro

## Phase 2 — Quality of life

- [ ] Search / filter history (by text, format, date)
- [ ] Richer parsing for structured payloads (Wi-Fi → "join" details, geo → map,
      vCard/meCard → contact fields, mailto/tel → actions)
- [ ] Boarding-pass (IATA BCBP) decode from PDF417 into a readable itinerary
- [ ] Scan confirmation polish (sound option, success animation, haptics already on)
- [ ] Tap-to-focus / pinch-to-zoom controls in the viewport
- [ ] Storage usage indicator + prune controls

## Phase 3 — Beyond

- [ ] CSV export; JSON import / restore
- [ ] Optional grouping/dedup view (collapse repeats, keep underlying events)
- [ ] Open-source the repository publicly
- [ ] (Maybe) opt-in privacy-respecting analytics via PostHog
- [ ] (Maybe) decode from a chosen image file, if a real need appears

## Explicitly out of scope

- Code **generation** (this is a reader).
- Any cloud sync / accounts / backend.
- iOS support as a priority (author is Android-only; the ZXing fallback should
  still work on iOS Safari, just untested).
