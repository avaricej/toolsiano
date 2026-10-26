import createDecoder from '@jsquash/avif/codec/dec/avif_dec.js';
import wasmUrl from '@jsquash/avif/codec/dec/avif_dec.wasm?url';

self.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer; width: number; height: number }>) => {
  try {
    const { bytes, width, height } = event.data;
    if (bytes.byteLength > 25 * 1024 * 1024 || width * height > 4000000) throw new Error();
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error();
    const decoder = await createDecoder({ noInitialRun: true, wasmBinary: await response.arrayBuffer() });
    const image = decoder.decode(bytes, 8);
    if (!image || image.width !== width || image.height !== height || image.data.length !== width * height * 4)
      throw new Error();
    const pixels = new Uint8Array(image.data).buffer;
    self.postMessage({ pixels }, { transfer: [pixels] });
  } catch { self.postMessage({ error: true }); }
};
