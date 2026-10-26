import createEncoder from '@jsquash/avif/codec/enc/avif_enc.js';
import wasmUrl from '@jsquash/avif/codec/enc/avif_enc.wasm?url';
import { defaultOptions } from '@jsquash/avif/meta.js';

// Explicitly use the single-thread codec inside our own worker. No SharedArrayBuffer,
// cross-origin isolation, nested workers, external URLs or dynamic code evaluation.
self.onmessage = async (
  event: MessageEvent<{ pixels: ArrayBuffer; width: number; height: number; quality: number }>,
) => {
  try {
    const { pixels, width, height, quality } = event.data;
    if (width * height > 4000000 || pixels.byteLength !== width * height * 4) throw new Error();
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error();
    const encoder = await createEncoder({
      noInitialRun: true,
      wasmBinary: await response.arrayBuffer(),
    });
    const output = encoder.encode(new Uint8Array(pixels), width, height, {
      ...defaultOptions,
      quality,
      qualityAlpha: 100,
      speed: 8,
      bitDepth: 8,
    });
    if (!output?.length) throw new Error();
    const buffer = new Uint8Array(output).buffer;
    self.postMessage({ buffer }, { transfer: [buffer] });
  } catch {
    self.postMessage({ error: true });
  }
};
