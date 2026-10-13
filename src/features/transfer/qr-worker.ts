import { prepareDecoder, decodeQr } from "./qr-decoder";
const scope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<{ data: Uint8ClampedArray; width: number; height: number }>) => void)
    | null;
  postMessage(value: unknown): void;
};
const failure = (error: unknown) =>
  scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
void prepareDecoder().then(() => scope.postMessage({ ready: true }), failure);
scope.onmessage = (event) => {
  const { data, width, height } = event.data;
  void decodeQr(data, width, height).then((text) => scope.postMessage({ text }), failure);
};
