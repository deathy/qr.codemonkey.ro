import type { IScannerControls } from '@zxing/browser';

// Hybrid scanner:
//  - Native Barcode Detection API when present (Android Chrome / the target
//    device). Fast, hardware-accelerated, zero download.
//  - ZXing (pure-JS) fallback for browsers without it (e.g. desktop Firefox).
// Either way WE own the MediaStream, so torch + frame capture behave the same.
//
// ZXing is ~300KB, so it is dynamically imported only on the fallback path —
// the target device uses the native engine and never downloads it.
//
// `BarcodeFormat` (global, snake_case string union) is the native API's type,
// declared in types/barcode-detector.d.ts.

export interface ScanHit {
  code: string;
  format: string;
}

export type EngineName = 'native' | 'zxing';

export interface CameraController {
  readonly engine: EngineName;
  stop(): void;
  hasTorch(): boolean;
  setTorch(on: boolean): Promise<void>;
  /** Grab the current frame as a downscaled JPEG, or null if unavailable. */
  captureFrame(): Promise<Blob | null>;
}

const NATIVE_FORMATS: BarcodeFormat[] = [
  'aztec', 'code_128', 'code_39', 'code_93', 'codabar', 'data_matrix',
  'ean_13', 'ean_8', 'itf', 'pdf417', 'qr_code', 'upc_a', 'upc_e'
];

async function startCamera(
  facingMode: 'environment' | 'user'
): Promise<{ stream: MediaStream; track: MediaStreamTrack }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      // Ask for 1080p: encourages the main (autofocus) rear camera over a
      // fixed-focus ultrawide, and gives sharper detail for small barcodes.
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });
  const track = stream.getVideoTracks()[0];
  return { stream, track };
}

// Default focus on Android is often left at a far/fixed distance, so a code
// held close stays blurred. Request continuous autofocus when the camera
// supports it. Best-effort: capability names are non-standard and vary.
async function applyContinuousFocus(track: MediaStreamTrack): Promise<void> {
  const caps = track.getCapabilities?.();
  if (!caps?.focusMode?.includes('continuous')) return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
  } catch {
    /* some devices reject focus constraints mid-stream; ignore */
  }
}

export async function startScanner(
  video: HTMLVideoElement,
  facingMode: 'environment' | 'user',
  onHit: (hit: ScanHit) => void
): Promise<CameraController> {
  const { stream, track } = await startCamera(facingMode);
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play();
  await applyContinuousFocus(track);

  const torchSupported = Boolean(track.getCapabilities?.().torch);
  const captureCanvas = document.createElement('canvas');

  async function captureFrame(): Promise<Blob | null> {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const maxW = 800;
    const scale = Math.min(1, maxW / w);
    captureCanvas.width = Math.round(w * scale);
    captureCanvas.height = Math.round(h * scale);
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    return new Promise((resolve) =>
      captureCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7)
    );
  }

  async function setTorch(on: boolean): Promise<void> {
    if (!torchSupported) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
    } catch {
      /* some devices reject mid-stream torch toggles; ignore */
    }
  }

  function stopStream() {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }

  const base = {
    hasTorch: () => torchSupported,
    setTorch,
    captureFrame
  };

  if (window.BarcodeDetector) {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    const detector = new window.BarcodeDetector(
      formats.length ? { formats } : undefined
    );

    let stopped = false;
    let busy = false;
    const timer = window.setInterval(async () => {
      if (stopped || busy || video.readyState < 2) return;
      busy = true;
      try {
        const found = await detector.detect(video);
        for (const b of found) {
          if (b.rawValue) onHit({ code: b.rawValue, format: b.format });
        }
      } catch {
        /* transient detect errors are normal between frames */
      } finally {
        busy = false;
      }
    }, 150);

    return {
      ...base,
      engine: 'native',
      stop() {
        stopped = true;
        window.clearInterval(timer);
        stopStream();
      }
    };
  }

  // Fallback: load ZXing on demand and decode from the video element we own.
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat: ZXingFormat }] =
    await Promise.all([import('@zxing/browser'), import('@zxing/library')]);

  const hints = new Map<number, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        ZXingFormat.AZTEC, ZXingFormat.CODE_128, ZXingFormat.CODE_39,
        ZXingFormat.CODE_93, ZXingFormat.CODABAR, ZXingFormat.DATA_MATRIX,
        ZXingFormat.EAN_13, ZXingFormat.EAN_8, ZXingFormat.ITF,
        ZXingFormat.PDF_417, ZXingFormat.QR_CODE, ZXingFormat.UPC_A,
        ZXingFormat.UPC_E
      ]
    ],
    [DecodeHintType.TRY_HARDER, true]
  ]);

  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 150
  });
  const controls: IScannerControls = await reader.decodeFromVideoElement(
    video,
    (result) => {
      if (result) {
        onHit({
          code: result.getText(),
          format: ZXingFormat[result.getBarcodeFormat()].toLowerCase()
        });
      }
    }
  );

  return {
    ...base,
    engine: 'zxing',
    stop() {
      controls.stop();
      stopStream();
    }
  };
}
