import { useEffect, useRef, useState } from 'preact/hooks';
import { startScanner, type CameraController, type ScanHit, type EngineName } from '../lib/scanner';
import type { Settings } from '../lib/types';

interface Props {
  settings: Settings;
  active: boolean;
  /** Called for every raw decode; recording/cooldown is handled by the parent. */
  onScan: (hit: ScanHit, captureFrame: () => Promise<Blob | null>) => void;
}

export function Scanner({ settings, active, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<CameraController | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [engine, setEngine] = useState<EngineName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);

  // (Re)start the camera when this view is active or the camera choice changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    setEngine(null);

    const video = videoRef.current;
    if (!video) return;

    startScanner(video, settings.facingMode, (hit) => {
      const ctrl = controllerRef.current;
      onScanRef.current(hit, () => (ctrl ? ctrl.captureFrame() : Promise.resolve(null)));
    })
      .then((ctrl) => {
        if (cancelled) {
          ctrl.stop();
          return;
        }
        controllerRef.current = ctrl;
        setEngine(ctrl.engine);
        setHasTorch(ctrl.hasTorch());
        void ctrl.setTorch(settings.torch);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err));
      });

    return () => {
      cancelled = true;
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings.facingMode]);

  // Apply torch changes without restarting the camera.
  useEffect(() => {
    void controllerRef.current?.setTorch(settings.torch);
  }, [settings.torch]);

  return (
    <div class="scanner">
      <div class="viewport">
        <video ref={videoRef} muted playsInline />
        <div class="reticle" />
        {engine && (
          <span class="engine-badge" title="Decoding engine in use">
            {engine === 'native' ? 'native' : 'zxing'}
          </span>
        )}
        {hasTorch && (
          <button
            class="torch-btn"
            aria-pressed={settings.torch}
            onClick={() => controllerRef.current?.setTorch(!settings.torch)}
            title="Torch is controlled in Settings; this is a quick toggle"
          >
            {settings.torch ? '🔦 on' : '🔦 off'}
          </button>
        )}
      </div>

      {error && <p class="error">{error}</p>}
      {!error && !engine && active && <p class="hint">Starting camera…</p>}
      {engine && (
        <p class="hint">
          Point the camera at a code. Scanning continuously — every read is saved to History.
        </p>
      )}
    </div>
  );
}

function describeError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError')
    return 'Camera permission was denied. Allow camera access and reload.';
  if (name === 'NotFoundError') return 'No camera found on this device.';
  if (name === 'NotReadableError')
    return 'The camera is in use by another app. Close it and try again.';
  if (!window.isSecureContext)
    return 'Camera needs a secure context (HTTPS). Open the deployed site or use localhost.';
  return `Could not start camera: ${(err as Error)?.message ?? 'unknown error'}`;
}
