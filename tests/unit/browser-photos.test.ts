import { afterEach, expect, test, vi } from "vitest";
import { importBrowserPhoto } from "../../src/infrastructure/browser-photos";
import { MAX_IMAGE_BYTES } from "../../src/domain/validate-project";

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const file = new File([bytes], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
  return file;
}
afterEach(() => {
  vi.unstubAllGlobals();
});

test("写真の向きをデコーダへ適用し、縦横比を保って縮小・再エンコードする", async () => {
  const close = vi.fn();
  const decode = vi.fn().mockResolvedValue({ width: 1200, height: 1600, close });
  vi.stubGlobal("createImageBitmap", decode);
  const draw: CanvasRenderingContext2D["drawImage"] = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
  } as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
    this: HTMLCanvasElement,
    mediaType,
  ) {
    expect(this.width).toBe(600);
    expect(this.height).toBe(800);
    return `data:${mediaType};base64,AAAA`;
  });
  const file = png(1200, 1600);
  expect(await importBrowserPhoto(file)).toEqual({
    mediaType: "image/png",
    base64: "AAAA",
    width: 600,
    height: 800,
  });
  expect(decode).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 600, 800);
  expect(close).toHaveBeenCalledOnce();
});

test("容量・MIME・寸法・画素数・壊れた画像を拒否し、デコード前に上限を確認する", async () => {
  const decode = vi.fn().mockRejectedValue(new Error("invalid image"));
  vi.stubGlobal("createImageBitmap", decode);
  await expect(
    importBrowserPhoto(
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }),
    ),
  ).rejects.toThrow("5MiB");
  await expect(
    importBrowserPhoto(new File(["svg"], "photo.svg", { type: "image/svg+xml" })),
  ).rejects.toThrow("JPEG／PNG");
  await expect(importBrowserPhoto(png(8193, 1))).rejects.toThrow("8192px");
  await expect(importBrowserPhoto(png(5000, 5000))).rejects.toThrow("1600万画素");
  expect(decode).not.toHaveBeenCalled();
  await expect(importBrowserPhoto(png(20, 20))).rejects.toThrow("読み込めません");
});
