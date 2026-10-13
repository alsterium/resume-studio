export interface QrDecoder {
  ready: Promise<void>;
  decode(image: ImageData): Promise<string | null>;
  stop(): void;
}
export function createQrDecoder(): QrDecoder {
  const worker = new Worker(new URL("./qr-worker.ts", import.meta.url), { type: "module" });
  return workerDecoder(worker);
}
export function workerDecoder(worker: Worker): QrDecoder {
  let stopped = false;
  let failure: Error | null = null;
  let pending: { resolve: (text: string | null) => void; reject: (error: Error) => void } | null =
    null;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const fail = (error: Error) => {
    failure = error;
    rejectReady(error);
    pending?.reject(error);
    pending = null;
  };
  worker.onmessage = (
    event: MessageEvent<{ ready?: boolean; text?: string | null; error?: string }>,
  ) => {
    if (stopped) return;
    if (event.data.error) fail(new Error(event.data.error));
    else if (event.data.ready) resolveReady();
    else {
      pending?.resolve(event.data.text ?? null);
      pending = null;
    }
  };
  worker.onerror = () => fail(new Error("QRデコーダを起動・実行できませんでした。"));
  worker.onmessageerror = () => fail(new Error("QRデコーダの応答を読み取れませんでした。"));
  return {
    ready,
    async decode(image) {
      await ready;
      if (failure) throw failure;
      if (stopped) throw new Error("QRデコーダを停止しました。");
      if (pending) throw new Error("QRの読み取り処理が重複しています。");
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try {
          worker.postMessage({ data: image.data, width: image.width, height: image.height }, [
            image.data.buffer,
          ]);
        } catch (error) {
          pending = null;
          reject(error);
        }
      });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      fail(new Error("QRデコーダを停止しました。"));
      worker.terminate();
    },
  };
}
