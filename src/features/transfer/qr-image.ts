import QRCode from "qrcode";
import jsQR from "jsqr";

export function qrMatrix(text: string) {
  return QRCode.create([{ data: new TextEncoder().encode(text), mode: "byte" }], {
    version: 40,
    errorCorrectionLevel: "M",
  }).modules;
}
export function qrPath(text: string) {
  const modules = qrMatrix(text);
  let path = "";
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size;) {
      if (!modules.get(y, x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < modules.size && modules.get(y, x)) x++;
      path += `M${start + 4} ${y + 4}h${x - start}v1h-${x - start}z`;
    }
  return path;
}
export function decodeQr(data: Uint8ClampedArray, width: number, height: number) {
  return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
}
