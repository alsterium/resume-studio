import { afterEach, expect, test, vi } from "vitest";
import { startCamera } from "../../src/features/transfer/camera";
import { decodeQr } from "../../src/features/transfer/qr-image";
vi.mock("../../src/features/transfer/qr-image", () => ({ decodeQr: vi.fn(() => "frame-data") }));
afterEach(() => {
  vi.useRealTimers();
});
function video() {
  const v = document.createElement("video");
  vi.spyOn(v, "play").mockResolvedValue();
  return v;
}
function setup() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const request = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: request,
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "camera", label: "camera" }],
    },
  });
  return { stop, stream, request };
}

test("映像だけを要求し、読取を繰り返し、停止後はスキャンとtrackを解放する", async () => {
  const { stop, request } = setup(),
    v = video(),
    frame = vi.fn();
  Object.defineProperties(v, {
    readyState: { value: 2 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  } as unknown as CanvasRenderingContext2D);
  vi.useFakeTimers();
  const session = await startCamera(v, frame, vi.fn());
  expect(request).toHaveBeenCalledWith({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  vi.advanceTimersByTime(0);
  expect(decodeQr).toHaveBeenCalled();
  expect(frame).toHaveBeenCalledWith("frame-data");
  session.stop();
  const calls = frame.mock.calls.length;
  vi.advanceTimersByTime(1000);
  expect(frame).toHaveBeenCalledTimes(calls);
  expect(stop).toHaveBeenCalledOnce();
  expect(v.srcObject).toBeNull();
});

test("権限待ちにabortした後にstreamが返ったら、映像を開始せず即座に停止する", async () => {
  const { stop, stream, request } = setup();
  let resolve!: (stream: MediaStream) => void;
  request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const v = video(),
    controller = new AbortController();
  const started = startCamera(v, vi.fn(), vi.fn(), undefined, controller.signal);
  controller.abort();
  resolve(stream);
  await expect(started).rejects.toThrow("中止");
  expect(stop).toHaveBeenCalled();
  expect(v.play).not.toHaveBeenCalled();
});

test("video再生の待機中もabortで即座にtrackを止め、後から解決してもスキャンしない", async () => {
  const { stop } = setup(),
    v = video(),
    controller = new AbortController();
  let resolve!: () => void;
  vi.mocked(v.play).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const started = startCamera(v, vi.fn(), vi.fn(), undefined, controller.signal);
  await Promise.resolve();
  controller.abort();
  expect(stop).toHaveBeenCalledOnce();
  resolve();
  await expect(started).rejects.toThrow("中止");
});
