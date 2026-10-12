import type { ImportedPhoto } from "./app-client";
import { MAX_IMAGE_BYTES } from "../domain/validate-project";

function dimensions(bytes: Uint8Array, mediaType: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    mediaType === "image/png" &&
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  )
    return [view.getUint32(16), view.getUint32(20)];
  if (mediaType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 8
      )
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      offset += length;
    }
  }
  throw new Error("写真は有効なJPEG／PNGを選択してください。");
}

export async function importBrowserPhoto(file: File): Promise<ImportedPhoto> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("写真は5MiB以内にしてください。");
  const mediaType = file.type;
  if (mediaType !== "image/jpeg" && mediaType !== "image/png")
    throw new Error("写真はJPEG／PNGを選択してください。");
  const [width, height] = dimensions(new Uint8Array(await file.arrayBuffer()), mediaType);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_000_000)
    throw new Error("写真は1辺8192px、1600万画素以内にしてください。");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("写真を読み込めませんでした。別のJPEG／PNGを選択してください。");
  }
  try {
    const scale = Math.min(1, 600 / bitmap.width, 800 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("写真を処理できませんでした。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL(mediaType, 0.9);
    if (!data.startsWith(`data:${mediaType};base64,`))
      throw new Error("写真を変換できませんでした。");
    return { mediaType, base64: data.split(",")[1], width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
