import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
export function prepareDecoder() {
  return prepareZXingModule({ fireImmediately: true });
}
export async function decodeQr(data: Uint8ClampedArray, width: number, height: number) {
  const image = { data, width, height, colorSpace: "srgb" } as ImageData;
  const results = await readBarcodes(image, {
    formats: ["QRCode"],
    maxNumberOfSymbols: 1,
    tryHarder: false,
    tryInvert: false,
    tryRotate: true,
    tryDownscale: false,
    textMode: "Plain",
  });
  return results[0]?.text ?? null;
}
