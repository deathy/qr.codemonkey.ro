// Ambient types for the native Barcode Detection API.
// https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
// Not yet in TypeScript's standard DOM lib, so we declare what we use.

export {};

declare global {
  type BarcodeFormat =
    | 'aztec'
    | 'code_128'
    | 'code_39'
    | 'code_93'
    | 'codabar'
    | 'data_matrix'
    | 'ean_13'
    | 'ean_8'
    | 'itf'
    | 'pdf417'
    | 'qr_code'
    | 'upc_a'
    | 'upc_e'
    | 'unknown';

  interface DetectedBarcode {
    boundingBox: DOMRectReadOnly;
    rawValue: string;
    format: BarcodeFormat;
    cornerPoints: ReadonlyArray<{ x: number; y: number }>;
  }

  interface BarcodeDetectorOptions {
    formats?: BarcodeFormat[];
  }

  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    static getSupportedFormats(): Promise<BarcodeFormat[]>;
    detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
  }

  interface Window {
    BarcodeDetector?: typeof BarcodeDetector;
  }

  // Torch is a non-standard but widely-supported MediaTrack constraint on Android.
  interface MediaTrackConstraintSet {
    torch?: boolean;
  }
  interface MediaTrackCapabilities {
    torch?: boolean;
  }
}
