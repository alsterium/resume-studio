import { installQrCrypto } from "../qr-crypto";
import { beforeAll, expect, test } from "vitest";
import { gzipSync } from "fflate";
import {
  prepareTransfer,
  frameText,
  parseFrame,
  TransferReceiver,
  inflateProject,
  crc32,
  FRAME_BYTES,
  CHUNK_BYTES,
} from "../../src/features/transfer/protocol";
import { qrMatrix } from "../../src/features/transfer/qr-image";
import { decodeQr } from "../../src/features/transfer/qr-decoder";
import { prepareZXingModule } from "zxing-wasm/reader";
import { readFileSync } from "node:fs";
beforeAll(async () => {
  await prepareZXingModule({
    overrides: {
      wasmBinary: new Uint8Array(
        readFileSync(new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"))),
      ).buffer,
    },
    fireImmediately: true,
  });
});
import { newProject } from "../../src/domain/new-project";
installQrCrypto();
import fixture from "../fixtures/project-full.json";
import { validateProject } from "../../src/domain/validate-project";
const full = validateProject(structuredClone(fixture));

function largeProject() {
  const project = structuredClone(full);
  let seed = 1;
  const bytes = Uint8Array.from({ length: 10000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  });
  project.assets[0].base64 = btoa(String.fromCharCode(...bytes));
  return project;
}
function changed(text: string, index: number, value: string) {
  const parts = text.split("|");
  parts[index] = value;
  return parts.join("|");
}

test("開始/データ/終了の途中から開始し、逆順・重複・周回越し欠落補完で同じ写真/AST/テンプレートを復元する", async () => {
  const project = largeProject();
  const transfer = await prepareTransfer(project);
  expect(transfer.count).toBeGreaterThan(2);
  const receiver = new TransferReceiver();
  receiver.accept(frameText(transfer, "D", transfer.count - 1));
  receiver.accept(frameText(transfer, "E"));
  expect(receiver.ready).toBe(false);
  expect(receiver.missing()).toContain(1);
  expect(receiver.received).toBe(1);
  receiver.accept(frameText(transfer, "B"));
  expect(receiver.received).toBe(1);
  for (let i = transfer.count - 2; i >= 0; i--) {
    expect(receiver.accept(frameText(transfer, "D", i))).toBe("data");
    expect(receiver.accept(frameText(transfer, "D", i))).toBe("duplicate");
  }
  expect(receiver.ready).toBe(false);
  await expect(receiver.finish()).rejects.toThrow("終了QR");
  receiver.accept(frameText(transfer, "E"));
  expect(receiver.ready).toBe(true);
  expect(await receiver.finish()).toEqual(project);
});

test("一般QRは無視し、別送信の混入と同じIDのメタデータ/番号の矛盾を拒否する", async () => {
  const transfer = await prepareTransfer(largeProject());
  const receiver = new TransferReceiver();
  expect(receiver.accept("https://example.com")).toBe("ignored");
  receiver.accept(frameText(transfer, "B"));
  const other = await prepareTransfer(newProject());
  expect(receiver.accept(frameText(other, "E"))).toBe("other");
  expect(() => receiver.accept(changed(frameText(transfer, "B"), 3, "0".repeat(64)))).toThrow(
    "矛盾",
  );
  receiver.accept(frameText(transfer, "D", 0));
  const broken = { ...transfer, compressed: transfer.compressed.slice() };
  broken.compressed[0] ^= 1;
  expect(() => receiver.accept(frameText(broken, "D", 0))).toThrow("矛盾");
  expect(receiver.received).toBe(1);
});

test("版・容量・数値・長さ・CRC・base64の異常フレームは状態を作る前に拒否する", async () => {
  const t = await prepareTransfer(full);
  const data = frameText(t, "D", 0),
    begin = frameText(t, "B");
  for (const text of [
    data.replace("RSQR2", "RSQR3"),
    changed(begin, 4, "22020097"),
    changed(begin, 5, "20971521"),
    changed(begin, 6, "0"),
    changed(data, 7, String(t.count)),
    changed(data, 4, "01"),
    changed(data, 8, "ffffffff"),
    changed(data, 9, "AA=A"),
    changed(data, 9, "AAA\n"),
    changed(begin, 7, "1"),
    changed(data, 6, String(t.count + 1)),
    data + "A".repeat(2332),
  ]) {
    const r = new TransferReceiver();
    expect(() => r.accept(text)).toThrow();
    expect(r.info).toBeNull();
  }
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});

test("終了を先に読んでも、最後の不足データの後に終了QRを読むまで確定しない", async () => {
  const t = await prepareTransfer(full),
    r = new TransferReceiver();
  r.accept(frameText(t, "E"));
  for (let i = 0; i < t.count; i++) r.accept(frameText(t, "D", i));
  expect(r.ready).toBe(false);
  r.accept(frameText(t, "E"));
  expect(await r.finish()).toEqual(full);
});

test("全体SHA・gzip CRC・展開上限・UTF8/JSON/Project検証を通らないデータを取り込まない", async () => {
  const t = await prepareTransfer(full),
    r = new TransferReceiver();
  const broken = { ...t, hash: "0".repeat(64) };
  for (let i = 0; i < t.count; i++) r.accept(frameText(broken, "D", i));
  r.accept(frameText(broken, "E"));
  await expect(r.finish()).rejects.toThrow("検査値");
  const corrupt = t.compressed.slice();
  corrupt[corrupt.length - 8] ^= 1;
  expect(() => inflateProject(corrupt, t.jsonBytes)).toThrow("検査値");
  expect(() => inflateProject(t.compressed, t.jsonBytes + 1)).toThrow("容量");
  expect(() => inflateProject(gzipSync(new Uint8Array(2 * 1024 * 1024)), 1000)).toThrow("上限");
  for (const value of ["{}", "not JSON"]) {
    const bytes = new TextEncoder().encode(value);
    expect(() => inflateProject(gzipSync(bytes), bytes.length)).toThrow();
  }
  expect(() => inflateProject(new Uint8Array(10), 1)).toThrow();
});

test("Version30/Mの実QR画像をZXing WASMで読み取り、全項目プロジェクトを再組立する", async () => {
  const t = await prepareTransfer(full),
    r = new TransferReceiver();
  for (let i = 0; i < t.count + 2; i++) {
    const text = frameText(
      t,
      i === 0 ? "B" : i === t.count + 1 ? "E" : "D",
      i === 0 || i === t.count + 1 ? 0 : i - 1,
    );
    expect(text.length).toBeLessThanOrEqual(FRAME_BYTES);
    const matrix = qrMatrix(text);
    expect(matrix.size).toBe(137);
    const width = 145 * 4,
      pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < 137; y++)
      for (let x = 0; x < 137; x++)
        if (matrix.get(y, x))
          for (let yy = 0; yy < 4; yy++)
            for (let xx = 0; xx < 4; xx++) {
              const index = (((y + 4) * 4 + yy) * width + (x + 4) * 4 + xx) * 4;
              pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
            }
    const decoded = await decodeQr(pixels, width, width);
    expect(decoded).toBe(text);
    r.accept(decoded!);
  }
  expect(await r.finish()).toEqual(full);
});

test("最大チャンクのフレームもVersion30/Mに収まり、JSONの圧縮効果を維持する", async () => {
  const t = await prepareTransfer(largeProject());
  const text = frameText(t, "D", 0);
  expect(parseFrame(text)!.data.length).toBe(CHUNK_BYTES);
  expect(text.length).toBeLessThanOrEqual(FRAME_BYTES);
  expect(qrMatrix(text).size).toBe(137);
  const empty = await prepareTransfer(newProject());
  expect(empty.compressedBytes).toBeLessThan(empty.jsonBytes);
});

test("旧RSQR1の1500byte分割送信も混ぜずに復元できる", async () => {
  const project = largeProject();
  const t = await prepareTransfer(project);
  const legacy = { ...t, chunkBytes: 1500, count: Math.ceil(t.compressedBytes / 1500) };
  const r = new TransferReceiver();
  const old = (kind: "B" | "D" | "E", index = 0) => {
    const parts = frameText(legacy, kind, index).split("|");
    parts[0] = "RSQR1";
    parts.pop();
    return parts.join("|");
  };
  r.accept(old("B"));
  for (let i = 0; i < legacy.count; i++) r.accept(old("D", i));
  r.accept(old("E"));
  expect(await r.finish()).toEqual(project);
  expect(() => parseFrame(changed(frameText(t, "B"), 10, "1500"))).toThrow();
});
