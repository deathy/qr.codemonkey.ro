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
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const focusTimer = useRef<number | undefined>(undefined);
  const msgTimer = useRef<number | undefined>(undefined);

  // (Re)start the camera when this view is active or the camera choice changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    setEngine(null);

    const video = videoRef.current;
    if (!video) return;

    startScanner(
      video,
      settings.facingMode,
      (hit) => {
        const ctrl = controllerRef.current;
        onScanRef.current(hit, () => (ctrl ? ctrl.captureFrame() : Promise.resolve(null)));
      },
      settings.forceZxing
    )
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
  }, [active, settings.facingMode, settings.forceZxing]);

  // Apply torch changes without restarting the camera.
  useEffect(() => {
    void controllerRef.current?.setTorch(settings.torch);
  }, [settings.torch]);

  function handleViewportClick(ev: MouseEvent) {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const xNorm = (ev.clientX - rect.left) / rect.width;
    const yNorm = (ev.clientY - rect.top) / rect.height;
    setFocusPoint({ x: xNorm * 100, y: yNorm * 100 });
    window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => setFocusPoint(null), 800);
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    void ctrl.focusAt(clamp(xNorm), clamp(yNorm));
  }

  async function handleCapture() {
    const ctrl = controllerRef.current;
    if (!ctrl || capturing) return;
    setCapturing(true);
    setCaptureMsg(null);
    try {
      const hits = await ctrl.scanStill();
      if (hits.length) {
        for (const hit of hits) onScanRef.current(hit, () => ctrl.captureFrame());
        setCaptureMsg(`Found ${hits.length} code${hits.length > 1 ? 's' : ''} ✓`);
      } else {
        setCaptureMsg('No code found — fill the frame, tap to focus, try again');
      }
    } catch {
      setCaptureMsg('Capture failed — try again');
    } finally {
      setCapturing(false);
      window.clearTimeout(msgTimer.current);
      msgTimer.current = window.setTimeout(() => setCaptureMsg(null), 2800);
    }
  }

  return (
    <div class="scanner">
      <div class="viewport" onClick={handleViewportClick}>
        <video ref={videoRef} muted playsInline />
        <div class="reticle" />
        {focusPoint && (
          <div
            class="focus-ring"
            style={{ left: `${focusPoint.x}%`, top: `${focusPoint.y}%` }}
          />
        )}
        {engine && (
          <span class="engine-badge" title="Decoding engine in use">
            {engine === 'native' ? 'native' : 'zxing'}
          </span>
        )}
        {hasTorch && (
          <button
            class="torch-btn"
            aria-pressed={settings.torch}
            onClick={(ev) => {
              ev.stopPropagation();
              void controllerRef.current?.setTorch(!settings.torch);
            }}
            title="Torch is controlled in Settings; this is a quick toggle"
          >
            {settings.torch ? '🔦 on' : '🔦 off'}
          </button>
        )}
      </div>

      {error && <p class="error">{error}</p>}
      {!error && !engine && active && <p class="hint">Starting camera…</p>}
      {engine && (
        <>
          <div class="capture-row">
            <button class="shutter" onClick={handleCapture} disabled={capturing}>
              {capturing ? 'Capturing…' : '📸 Capture (for dense codes)'}
            </button>
            {captureMsg && <span class="capture-msg">{captureMsg}</span>}
          </div>
          <p class="hint">
            Scanning continuously — every read is saved to History. Tap the image to focus.
            For dense codes (boarding passes, Aztec), hold steady and tap <b>Capture</b> to
            decode a sharp full-resolution photo.
          </p>
        </>
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
