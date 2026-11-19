import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  startScanner,
  type CameraController,
  type ScanHit,
  type EngineName,
  type CameraDiagnostics
} from '../lib/scanner';
import type { Settings } from '../lib/types';
import {
  currentBrowserEnv,
  inAppWarning,
  permissionHelp,
  type BrowserEnv,
  type PermissionHelp
} from '../lib/camera-help';

// Remembers that the camera has started on this device before, so browsers
// without a queryable 'camera' permission (Firefox) still auto-start next time.
const STARTED_KEY = 'qr.cameraStarted.v1';

function rememberedStart(): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberStart(): void {
  try {
    localStorage.setItem(STARTED_KEY, '1');
  } catch {
    /* storage unavailable; we'll just ask for a tap next time */
  }
}

type CameraPermission = PermissionState | 'unknown';

async function queryCameraPermission(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({ name: 'camera' as PermissionName });
  } catch {
    return null; // Firefox and older Safari don't support the 'camera' name
  }
}

interface CameraError {
  message: string;
  help: PermissionHelp | null;
}

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

  const env = useMemo(currentBrowserEnv, []);
  const [engine, setEngine] = useState<EngineName | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  // Camera starts only once "armed": automatically when permission is already
  // granted (or it worked here before), otherwise on a tap. A tap is a real user
  // gesture, which some iOS browsers need before they'll show the prompt, and it
  // gives a Retry path that doesn't require reloading the page.
  const [permission, setPermission] = useState<CameraPermission>('unknown');
  const [permChecked, setPermChecked] = useState(false);
  const [armed, setArmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hasTorch, setHasTorch] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<CameraDiagnostics | null>(null);
  const focusTimer = useRef<number | undefined>(undefined);
  const msgTimer = useRef<number | undefined>(undefined);

  // Check the permission state once, and follow changes (e.g. the user flips
  // the site setting while the page is open → start without a reload).
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let disposed = false;
    const onChange = () => {
      if (!status) return;
      setPermission(status.state);
      // Only kick a (re)start if the camera isn't already running — Chrome also
      // fires 'change' right after our own successful prompt.
      if (status.state === 'granted' && !controllerRef.current) {
        setArmed(true);
        setAttempt((n) => n + 1);
      }
    };
    void queryCameraPermission().then((s) => {
      if (disposed) return;
      status = s;
      const state: CameraPermission = s?.state ?? 'unknown';
      setPermission(state);
      if (state === 'granted' || (state !== 'denied' && rememberedStart())) setArmed(true);
      setPermChecked(true);
      s?.addEventListener('change', onChange);
    });
    return () => {
      disposed = true;
      status?.removeEventListener('change', onChange);
    };
  }, []);

  function startCamera() {
    setArmed(true);
    setAttempt((n) => n + 1);
  }

  // (Re)start the camera when this view is active or the camera choice changes.
  useEffect(() => {
    if (!active || !armed) return;
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
      settings.forceZxing,
      settings.cameraId
    )
      .then((ctrl) => {
        if (cancelled) {
          ctrl.stop();
          return;
        }
        controllerRef.current = ctrl;
        rememberStart();
        setPermission('granted');
        setEngine(ctrl.engine);
        setHasTorch(ctrl.hasTorch());
        void ctrl.setTorch(settings.torch);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err, env));
      });

    return () => {
      cancelled = true;
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, armed, attempt, settings.facingMode, settings.forceZxing, settings.cameraId]);

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

  async function loadDiagnostics() {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    setDiag(await ctrl.diagnostics());
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

  // Tap-to-start overlay: before the first start (when we couldn't auto-start)
  // and after a failure, as a Retry that doesn't need a page reload.
  const showGate = active && !engine && permChecked && (!armed || error !== null);
  const deniedUpfront = showGate && !armed && permission === 'denied';
  const deniedHelp = permissionHelp(env);
  // The in-app warning is already the whole help text when help is shown.
  const inAppMsg =
    active && !engine && !error?.help && !deniedUpfront ? inAppWarning(env) : null;

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
        {showGate && (
          <div class="camera-gate">
            <button
              class="shutter"
              onClick={(ev) => {
                ev.stopPropagation();
                startCamera();
              }}
            >
              {error ? '↻ Retry' : deniedUpfront ? 'Try anyway' : '📷 Start camera'}
            </button>
          </div>
        )}
      </div>

      {inAppMsg && <p class="error">{inAppMsg}</p>}
      {error && <p class="error">{error.message}</p>}
      {error?.help && <HelpSteps help={error.help} />}
      {deniedUpfront && (
        <>
          <p class="error">{deniedHelp.title}</p>
          <HelpSteps help={deniedHelp} />
        </>
      )}
      {showGate && !error && !deniedUpfront && (
        <p class="hint">
          Tap <b>Start camera</b> — your browser will ask for camera access. Video is
          processed on this device and never uploaded.
        </p>
      )}
      {!error && !engine && active && armed && <p class="hint">Starting camera…</p>}
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

          <details class="diagnostics" onToggle={(ev) => {
            if ((ev.currentTarget as HTMLDetailsElement).open) void loadDiagnostics();
          }}>
            <summary>Camera diagnostics</summary>
            <button onClick={loadDiagnostics}>Refresh</button>
            {diag && (
              <pre>
{`label: ${diag.label || '(hidden)'}
focusStatus: ${diag.focusStatus}
settings: ${JSON.stringify(diag.settings, null, 2)}
capabilities: ${JSON.stringify(diag.capabilities, null, 2)}
videoDevices:
${diag.devices.map((d) => `  - ${d.label}`).join('\n') || '  (none / labels hidden)'}`}
              </pre>
            )}
          </details>
        </>
      )}
    </div>
  );
}

function describeError(err: unknown, env: BrowserEnv): CameraError {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    const help = permissionHelp(env);
    return { message: help.title, help };
  }
  const simple = (message: string): CameraError => ({ message, help: null });
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return simple('No camera found on this device.');
  if (name === 'NotReadableError' || name === 'AbortError')
    return simple('The camera is in use by another app. Close it and tap Retry.');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    return simple(
      'Camera needs a secure context (HTTPS). Open the deployed site or use localhost.'
    );
  return simple(`Could not start camera: ${(err as Error)?.message ?? 'unknown error'}`);
}

function HelpSteps({ help }: { help: PermissionHelp }) {
  return (
    <ol class="camera-help">
      {help.steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
