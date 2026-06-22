// Core data model. The shape of a stored scan is also the shape we export,
// so keep this stable and version any breaking changes via EXPORT_VERSION.

export interface GpsFix {
  lat: number;
  lng: number;
  /** Accuracy radius in metres, as reported by the Geolocation API. */
  accuracy: number;
}

export interface ScanEntry {
  /** Stable unique id (also the key for the image blob, if any). */
  id: string;
  /** The decoded payload, exactly as read. Immutable. */
  code: string;
  /** Symbology, e.g. 'qr_code', 'ean_13', 'code_128', 'pdf417'. */
  format: string;
  /** Epoch milliseconds at the moment of decode. */
  timestamp: number;
  /** Optional user-added note. The only mutable field. */
  note?: string;
  /** Captured location, if the "save GPS" setting was on. */
  gps?: GpsFix | null;
  /** True when a frame image is stored under this id in the images store. */
  hasImage?: boolean;
}

export interface Settings {
  /** Capture and store GPS fix with each scan. Default off. */
  saveGps: boolean;
  /** Capture and store a JPEG frame with each scan. Default off. */
  saveImage: boolean;
  /** Suppress re-logging the same payload for this many ms. */
  cooldownMs: number;
  /** Preferred camera. 'environment' = rear (default). Fallback when no cameraId. */
  facingMode: 'environment' | 'user';
  /** Explicit camera deviceId, or null to auto-pick the main rear camera. */
  cameraId: string | null;
  /** Keep the torch (flashlight) on while scanning, if supported. */
  torch: boolean;
  /** Force the ZXing engine even when the native detector is available. */
  forceZxing: boolean;
  /** Play a short blip on each successful scan. */
  sound: boolean;
}

export const EXPORT_VERSION = 1;
