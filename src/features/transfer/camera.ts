import { createQrDecoder, type QrDecoder } from "./qr-worker-client";
export interface CameraSession {
  stop(): void;
  devices: MediaDeviceInfo[];
}
export async function startCamera(
  video: HTMLVideoElement,
  onFrame: (text: string) => void,
  onError: (failure: unknown) => void,
  deviceId?: string,
  signal?: AbortSignal,
): Promise<CameraSession> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error(
      "この環境ではカメラを利用できません。HTTPS Web版またはカメラ対応端末でお試しください。",
    );
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  let stopped = false;
  let timer: number | undefined;
  let videoCallback: number | undefined;
  let decoder: QrDecoder | null = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    if (videoCallback !== undefined) video.cancelVideoFrameCallback(videoCallback);
    decoder?.stop();
    stream.getTracks().forEach((track) => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
    signal?.removeEventListener("abort", stop);
  };
  try {
    if (signal?.aborted) {
      stop();
      throw new Error("カメラの起動を中止しました。");
    }
    signal?.addEventListener("abort", stop, { once: true });
    video.srcObject = stream;
    await video.play();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "videoinput",
    );
    if (stopped) throw new Error("カメラの起動を中止しました。");
    decoder = createQrDecoder();
    await decoder.ready;
    if (stopped) throw new Error("カメラの起動を中止しました。");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("カメラ画像を読み取れませんでした。");
    const schedule = () => {
      if (stopped) return;
      if (video.requestVideoFrameCallback)
        videoCallback = video.requestVideoFrameCallback(() => {
          void scan();
        });
      else
        timer = window.setTimeout(() => {
          void scan();
        }, 16);
    };
    const scan = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2 && video.videoWidth && !document.hidden) {
          const scale = Math.min(1, 1920 / video.videoWidth, 1080 / video.videoHeight);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const text = await decoder!.decode(image);
          if (stopped) return;
          if (text) onFrame(text);
        }
      } catch (failure) {
        if (stopped) return;
        stop();
        onError(failure);
        return;
      }
      schedule();
    };
    schedule();
    return { stop, devices };
  } catch (failure) {
    stop();
    throw failure;
  }
}
