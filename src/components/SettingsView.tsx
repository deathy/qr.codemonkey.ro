import type { Settings } from '../lib/types';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="setting">
      <div class="setting-text">
        <span class="setting-label">{label}</span>
        {hint && <span class="setting-hint">{hint}</span>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(ev) => onChange((ev.target as HTMLInputElement).checked)}
      />
    </label>
  );
}

export function SettingsView({ settings, onChange }: Props) {
  return (
    <div class="settings-view">
      <h2>Settings</h2>

      <Toggle
        label="Save GPS location"
        hint="Records where each code was scanned. Asks for location permission. Off by default."
        checked={settings.saveGps}
        onChange={(v) => onChange({ saveGps: v })}
      />

      <Toggle
        label="Save camera frame"
        hint="Stores a small JPEG of the frame with each scan. Uses more storage. Off by default."
        checked={settings.saveImage}
        onChange={(v) => onChange({ saveImage: v })}
      />

      <Toggle
        label="Torch (flashlight)"
        hint="Keeps the light on while scanning, if your camera supports it."
        checked={settings.torch}
        onChange={(v) => onChange({ torch: v })}
      />

      <label class="setting">
        <div class="setting-text">
          <span class="setting-label">Camera</span>
          <span class="setting-hint">Rear is best for scanning while you watch the screen.</span>
        </div>
        <select
          value={settings.facingMode}
          onChange={(ev) =>
            onChange({ facingMode: (ev.target as HTMLSelectElement).value as Settings['facingMode'] })
          }
        >
          <option value="environment">Rear</option>
          <option value="user">Front</option>
        </select>
      </label>

      <label class="setting">
        <div class="setting-text">
          <span class="setting-label">Re-scan cooldown</span>
          <span class="setting-hint">
            Ignore the same code for this long, so holding on a product doesn't log it repeatedly.
          </span>
        </div>
        <select
          value={String(settings.cooldownMs)}
          onChange={(ev) =>
            onChange({ cooldownMs: Number((ev.target as HTMLSelectElement).value) })
          }
        >
          <option value="0">Off</option>
          <option value="1000">1s</option>
          <option value="1500">1.5s</option>
          <option value="2000">2s</option>
          <option value="5000">5s</option>
        </select>
      </label>

      <p class="privacy-note">
        Everything stays on this device. No accounts, no servers, no analytics. Your scans,
        locations and images never leave your browser unless you export them yourself.
      </p>

      <p class="build-info">
        <a
          href={`https://github.com/deathy/qr.codemonkey.ro/commit/${__COMMIT__}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {__COMMIT__}
        </a>{' '}
        · built {new Date(__BUILD_TIME__).toLocaleString()}
      </p>
    </div>
  );
}
