import QRCode from "qrcode";

export function qrMatrix(text: string) {
  return QRCode.create([{ data: new TextEncoder().encode(text), mode: "byte" }], {
    version: 30,
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
