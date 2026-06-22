import type { GpsFix } from './types';

// A single GPS read can take seconds, which would stall batch scanning.
// So we keep the most recent fix and reuse it within a short freshness window.

let lastFix: GpsFix | null = null;
let lastFixAt = 0;
const MAX_AGE_MS = 15_000;

function read(timeoutMs: number): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: MAX_AGE_MS }
    );
  });
}

/**
 * Best-effort current location. Returns a recent cached fix immediately when
 * one is fresh, otherwise tries to read a new one. Never throws — returns null
 * on denial/timeout so a scan is still recorded.
 */
export async function getLocation(timestamp: number): Promise<GpsFix | null> {
  if (lastFix && timestamp - lastFixAt < MAX_AGE_MS) {
    return lastFix;
  }
  try {
    const fix = await read(8_000);
    lastFix = fix;
    lastFixAt = timestamp;
    return fix;
  } catch {
    return lastFix; // may be a slightly stale fix, or null
  }
}

/** Warm the cache / trigger the permission prompt up front. */
export function primeLocation(): void {
  read(10_000)
    .then((fix) => {
      lastFix = fix;
      lastFixAt = performance.timeOrigin + performance.now();
    })
    .catch(() => {
      /* ignore — handled lazily at scan time */
    });
}
