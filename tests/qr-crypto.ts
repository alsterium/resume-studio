import { createHash, randomBytes, randomUUID } from "node:crypto";
import { vi } from "vitest";
// Vitest's jsdom worker uses a different ArrayBuffer realm from Node WebCrypto.
// Use Node's real SHA-256 on copied bytes; production uses browser WebCrypto.
export function installQrCrypto() {
  vi.stubGlobal("crypto", {
    randomUUID,
    getRandomValues: (target: Uint8Array) => {
      target.set(randomBytes(target.length));
      return target;
    },
    subtle: {
      digest: async (_algorithm: string, buffer: ArrayBuffer) =>
        Uint8Array.from(
          createHash("sha256")
            .update(Buffer.from(new Uint8Array(buffer)))
            .digest(),
        ).buffer,
    },
  });
}
