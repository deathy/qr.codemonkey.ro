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
  /** Focus the lens at a normalised (0..1) point in the frame. Best-effort. */
  focusAt(xNorm: number, yNorm: number): Promise<void>;
  /**
   * Take a full-resolution still and decode it. For dense codes (PDF417,
   * Aztec) the soft live preview often won't resolve the fine structure; a
   * crisp photo will. Returns all codes found in the still.
   */
  scanStill(): Promise<ScanHit[]>;
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

  // Highest-quality still we can get: a real photo (autofocused, full sensor
  // resolution) when ImageCapture supports it, else a grabbed frame, else the
  // video element. Caller must close() the returned bitmap.
  async function grabHiRes(): Promise<ImageBitmap | null> {
    // ImageCapture isn't in the standard TS DOM lib; type its shape inline.
    const ImageCaptureCtor = (window as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => {
        takePhoto(): Promise<Blob>;
        grabFrame(): Promise<ImageBitmap>;
      };
    }).ImageCapture;
    try {
      if (ImageCaptureCtor) {
        const capture = new ImageCaptureCtor(track);
        try {
          const blob = await capture.takePhoto();
          return await createImageBitmap(blob);
        } catch {
          return await capture.grabFrame();
        }
      }
    } catch {
      /* fall through to the video frame */
    }
    if (video.videoWidth) return createImageBitmap(video);
    return null;
  }

  async function focusAt(xNorm: number, yNorm: number): Promise<void> {
    const caps = track.getCapabilities?.();
    const advanced: MediaTrackConstraintSet[] = [];
    if (caps && 'pointsOfInterest' in caps) {
      advanced.push({ pointsOfInterest: [{ x: xNorm, y: yNorm }] });
    }
    if (caps?.focusMode?.includes('single-shot')) advanced.push({ focusMode: 'single-shot' });
    else if (caps?.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
    if (!advanced.length) return;
    try {
      await track.applyConstraints({ advanced });
    } catch {
      /* best-effort; ignore rejected focus constraints */
    }
  }

  const base = {
    hasTorch: () => torchSupported,
    setTorch,
    captureFrame,
    focusAt
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

    async function scanStill(): Promise<ScanHit[]> {
      const bitmap = await grabHiRes();
      if (!bitmap) return [];
      try {
        const found = await detector.detect(bitmap);
        return found
          .filter((b) => b.rawValue)
          .map((b) => ({ code: b.rawValue, format: b.format }));
      } catch {
        return [];
      } finally {
        bitmap.close();
      }
    }

    return {
      ...base,
      engine: 'native',
      scanStill,
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

  async function scanStill(): Promise<ScanHit[]> {
    const bitmap = await grabHiRes();
    if (!bitmap) return [];
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];
      ctx.drawImage(bitmap, 0, 0);
      try {
        const result = reader.decodeFromCanvas(canvas);
        return [
          {
            code: result.getText(),
            format: ZXingFormat[result.getBarcodeFormat()].toLowerCase()
          }
        ];
      } catch {
        return []; // ZXing throws NotFoundException when nothing decodes
      }
    } finally {
      bitmap.close();
    }
  }

  return {
    ...base,
    engine: 'zxing',
    scanStill,
    stop() {
      controls.stop();
      stopStream();
    }
  };
}
