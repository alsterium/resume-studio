import { expect, test, vi } from "vitest";
import { workerDecoder } from "../../src/features/transfer/qr-worker-client";
function setup() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  } as unknown as Worker;
  const decoder = workerDecoder(worker);
  const respond = (data: unknown) => worker.onmessage?.({ data } as MessageEvent);
  const image = { data: new Uint8ClampedArray(16), width: 2, height: 2 } as ImageData;
  return { worker, decoder, respond, image };
}
test("WASM準備完了後に転送可能な画像を送信し、一度に1枚だけ処理する", async () => {
  const { worker, decoder, respond, image } = setup();
  const first = decoder.decode(image);
  expect(worker.postMessage).not.toHaveBeenCalled();
  respond({ ready: true });
  await decoder.ready;
  expect(worker.postMessage).toHaveBeenCalledWith({ data: image.data, width: 2, height: 2 }, [
    image.data.buffer,
  ]);
  await expect(decoder.decode(image)).rejects.toThrow("重複");
  respond({ text: "RSQR2|test" });
  expect(await first).toBe("RSQR2|test");
  const next = decoder.decode(image);
  await Promise.resolve();
  respond({ text: null });
  expect(await next).toBeNull();
  decoder.stop();
});
test("起動待ちとデコード待ちを停止で解放し、遅い応答を無視する", async () => {
  const boot = setup();
  const booted = expect(boot.decoder.ready).rejects.toThrow("停止");
  boot.decoder.stop();
  boot.decoder.stop();
  await booted;
  expect(boot.worker.terminate).toHaveBeenCalledOnce();
  const { worker, decoder, respond, image } = setup();
  respond({ ready: true });
  const promise = decoder.decode(image);
  await Promise.resolve();
  const rejected = expect(promise).rejects.toThrow("停止");
  decoder.stop();
  respond({ text: "late" });
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
});
test("WASM初期化とWorker通信の異常を呼出元へ返す", async () => {
  const boot = setup();
  const rejected = expect(boot.decoder.ready).rejects.toThrow("compile");
  boot.respond({ error: "compile" });
  await rejected;
  boot.decoder.stop();
  const { decoder, worker, respond, image } = setup();
  respond({ ready: true });
  const promise = decoder.decode(image);
  await Promise.resolve();
  const failure = expect(promise).rejects.toThrow("応答");
  worker.onmessageerror?.({} as MessageEvent);
  await failure;
  decoder.stop();
});
