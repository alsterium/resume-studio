import { gzipSync, Gunzip } from "fflate";
import type { Project } from "../../domain/project";
import { MAX_PROJECT_BYTES, validateProject } from "../../domain/validate-project";

export const CHUNK_BYTES = 1500;
export const MAX_COMPRESSED_BYTES = 21 * 1024 * 1024;
export const FRAME_BYTES = 2331;
export type FrameKind = "B" | "D" | "E";
export interface TransferInfo {
  id: string;
  hash: string;
  compressedBytes: number;
  jsonBytes: number;
  count: number;
}
export interface Frame extends TransferInfo {
  kind: FrameKind;
  index: number;
  data: Uint8Array;
}
export interface PreparedTransfer extends TransferInfo {
  compressed: Uint8Array;
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (bytes: Uint8Array) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)));
const fail = (message: string): never => {
  throw new Error(message);
};
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const checksum = (bytes: Uint8Array) => crc32(bytes).toString(16).padStart(8, "0");
function encode64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function decode64(text: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$(?![\s\S])/.test(text))
    fail("QRのデータ形式が不正です。");
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  if (encode64(bytes) !== text) fail("QRのbase64が不正です。");
  return bytes;
}
export async function prepareTransfer(project: Project): Promise<PreparedTransfer> {
  const json = new TextEncoder().encode(JSON.stringify(validateProject(project)));
  if (json.length > MAX_PROJECT_BYTES) fail("転送するJSONは20MiB以内にしてください。");
  const compressed = gzipSync(json, { level: 6, mtime: 0 });
  if (compressed.length > MAX_COMPRESSED_BYTES) fail("転送データの容量が上限を超えています。");
  return {
    id: hex(crypto.getRandomValues(new Uint8Array(16))),
    hash: await sha(compressed),
    compressedBytes: compressed.length,
    jsonBytes: json.length,
    count: Math.ceil(compressed.length / CHUNK_BYTES),
    compressed,
  };
}
export function frameText(transfer: PreparedTransfer, kind: FrameKind, index = 0): string {
  if (kind === "D" && (!Number.isInteger(index) || index < 0 || index >= transfer.count))
    fail("QR番号が範囲外です。");
  const data =
    kind === "D"
      ? transfer.compressed.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)
      : new Uint8Array();
  return [
    "RSQR1",
    kind,
    transfer.id,
    transfer.hash,
    transfer.compressedBytes,
    transfer.jsonBytes,
    transfer.count,
    kind === "D" ? index : 0,
    checksum(data),
    encode64(data),
  ].join("|");
}
function integer(text: string, max: number, min = 0) {
  if (!/^(0|[1-9][0-9]*)$(?![\s\S])/.test(text)) fail("QRの数値形式が不正です。");
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail("QRの容量・番号が上限を超えています。");
  return value;
}
export function parseFrame(text: string): Frame | null {
  if (!text.startsWith("RSQR")) return null;
  if (text.length > FRAME_BYTES) fail("QRの容量が上限を超えています。");
  const parts = text.split("|");
  if (parts.length !== 10 || parts[0] !== "RSQR1") fail("対応していないQR転送形式です。");
  const [, kind, id, hash, packed, raw, total, number, crc, payload] = parts;
  if (
    !["B", "D", "E"].includes(kind) ||
    !/^[a-f0-9]{32}$/.test(id) ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    !/^[a-f0-9]{8}$/.test(crc)
  )
    fail("QRのヘッダーが不正です。");
  const compressedBytes = integer(packed, MAX_COMPRESSED_BYTES, 1),
    jsonBytes = integer(raw, MAX_PROJECT_BYTES, 1);
  const count = integer(total, Math.ceil(MAX_COMPRESSED_BYTES / CHUNK_BYTES), 1),
    index = integer(number, count - 1);
  if (count !== Math.ceil(compressedBytes / CHUNK_BYTES)) fail("QRの分割数が不正です。");
  const data = decode64(payload);
  const expected = kind === "D" ? Math.min(CHUNK_BYTES, compressedBytes - index * CHUNK_BYTES) : 0;
  if (data.length !== expected || checksum(data) !== crc || (kind !== "D" && index !== 0))
    fail("QRデータが破損しています。次の周回で読み直してください。");
  return { kind: kind as FrameKind, id, hash, compressedBytes, jsonBytes, count, index, data };
}
export function inflateProject(bytes: Uint8Array, jsonBytes: number): Project {
  if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8)
    fail("圧縮データが不正です。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const decoder = new Gunzip((chunk) => {
    size += chunk.length;
    if (size > jsonBytes || size > MAX_PROJECT_BYTES) fail("展開後の容量が上限を超えています。");
    chunks.push(chunk);
  });
  for (let offset = 0; offset < bytes.length; offset += 1024)
    decoder.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  if (size !== jsonBytes) fail("展開後の容量が一致しません。");
  const json = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    json.set(chunk, position);
    position += chunk.length;
  }
  const trailer = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 8);
  if (trailer.getUint32(0, true) !== crc32(json) || trailer.getUint32(4, true) !== size)
    fail("圧縮データの検査値が一致しません。");
  return validateProject(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)));
}
export class TransferReceiver {
  info: TransferInfo | null = null;
  private chunks = new Map<number, Uint8Array>();
  private ended = false;
  get received() {
    return this.chunks.size;
  }
  get ready() {
    return this.info !== null && this.received === this.info.count && this.ended;
  }
  missing(limit = 20) {
    const result: number[] = [];
    if (this.info)
      for (let i = 0; i < this.info.count && result.length < limit; i++)
        if (!this.chunks.has(i)) result.push(i + 1);
    return result;
  }
  accept(text: string): "ignored" | "other" | "start" | "end" | "data" | "duplicate" {
    const frame = parseFrame(text);
    if (!frame) return "ignored";
    if (this.info && frame.id !== this.info.id) return "other";
    if (
      this.info &&
      (frame.hash !== this.info.hash ||
        frame.count !== this.info.count ||
        frame.compressedBytes !== this.info.compressedBytes ||
        frame.jsonBytes !== this.info.jsonBytes)
    )
      fail("同じ転送IDの内容が矛盾しています。送信をやり直してください。");
    this.info ??= {
      id: frame.id,
      hash: frame.hash,
      count: frame.count,
      compressedBytes: frame.compressedBytes,
      jsonBytes: frame.jsonBytes,
    };
    if (frame.kind === "B") {
      this.ended = false;
      return "start";
    }
    if (frame.kind === "E") {
      this.ended = true;
      return "end";
    }
    const existing = this.chunks.get(frame.index);
    if (existing) {
      if (existing.some((byte, i) => byte !== frame.data[i]))
        fail("同じQR番号の内容が矛盾しています。");
      return "duplicate";
    }
    this.chunks.set(frame.index, frame.data);
    this.ended = false;
    return "data";
  }
  async finish(): Promise<Project> {
    if (!this.ready || !this.info) fail("データと終了QRがまだ揃っていません。");
    const info = this.info!;
    const bytes = new Uint8Array(info.compressedBytes);
    for (const [index, chunk] of this.chunks) bytes.set(chunk, index * CHUNK_BYTES);
    if ((await sha(bytes)) !== info.hash)
      fail("データ全体の検査値が一致しません。送信をやり直してください。");
    return inflateProject(bytes, info.jsonBytes);
  }
}
