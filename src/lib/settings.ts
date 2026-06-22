import type { Settings } from './types';

const KEY = 'qr.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  saveGps: false,
  saveImage: false,
  cooldownMs: 1500,
  facingMode: 'environment',
  torch: false,
  forceZxing: false
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable in private mode; settings just won't persist */
  }
}
