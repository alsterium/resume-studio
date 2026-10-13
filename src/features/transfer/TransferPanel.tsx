import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../../domain/project";
import { Button } from "../../components/ui/button";
import { prepareTransfer, frameText, TransferReceiver, type PreparedTransfer } from "./protocol";
import { qrPath } from "./qr-image";
import { startCamera, type CameraSession } from "./camera";
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);
export default function TransferPanel({
  project,
  dirty,
  onReceive,
}: {
  project: Project;
  dirty: boolean;
  onReceive: (project: Project) => void;
}) {
  const [mode, setMode] = useState<"choose" | "send" | "receive">("choose");
  return (
    <div className="qr-transfer-panel">
      <div className="qr-mode-buttons">
        <Button variant={mode === "send" ? "default" : "outline"} onClick={() => setMode("send")}>
          送信モード
        </Button>
        <Button
          variant={mode === "receive" ? "default" : "outline"}
          onClick={() => setMode("receive")}
        >
          受信モード
        </Button>
      </div>
      {mode === "choose" && (
        <p>
          受信が完了したら内容を確認して取り込みます。受信途中のデータは現在の編集内容に影響しません。
        </p>
      )}
      {mode === "send" && <Sender project={project} />}
      {mode === "receive" && <Receiver dirty={dirty} onReceive={onReceive} />}
    </div>
  );
}
export function Sender({ project }: { project: Project }) {
  const [transfer, setTransfer] = useState<PreparedTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [interval, setIntervalMs] = useState(500);
  const [intervalInput, setIntervalInput] = useState("0.5");
  const [number, setNumber] = useState("1");
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    let active = true;
    // Keep the sender on the snapshot present when this mode was opened.
    void prepareTransfer(project).then(
      (value) => {
        if (active) setTransfer(value);
      },
      (failure) => {
        if (active) setError(message(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [project]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (!playing || !transfer || hidden) return;
    const timer = window.setInterval(
      () => setPosition((current) => (current + 1) % (transfer.count + 2)),
      interval,
    );
    return () => window.clearInterval(timer);
  }, [playing, transfer, hidden, interval]);
  const text = transfer
    ? frameText(
        transfer,
        position === 0 ? "B" : position === transfer.count + 1 ? "E" : "D",
        position === 0 || position === transfer.count + 1 ? 0 : position - 1,
      )
    : null;
  const path = useMemo(() => (text ? qrPath(text) : null), [text]);
  if (error) return <p role="alert">{error}</p>;
  if (!transfer || !path) return <p aria-busy="true">JSONをDEFLATE圧縮して準備中…</p>;
  const phase =
    position === 0
      ? "開始QR"
      : position === transfer.count + 1
        ? "終了QR"
        : `データQR ${position} / ${transfer.count}`;
  return (
    <section aria-label="QR送信">
      <p>
        写真を含む {Math.ceil(transfer.jsonBytes / 1024)}KiB → 圧縮後{" "}
        {Math.ceil(transfer.compressedBytes / 1024)}KiB ／ データ{transfer.count}枚
      </p>
      <p>
        最短1周：約{Math.ceil(((transfer.count + 2) * interval) / 1000)}
        秒。開始→データ→終了を繰り返します。
      </p>
      <div className="qr-symbol">
        <svg aria-hidden="true" viewBox="0 0 145 145" shapeRendering="crispEdges">
          <rect width="145" height="145" fill="white" />
          <path d={path} fill="black" />
        </svg>
      </div>
      <p className="qr-phase" aria-live={playing ? "off" : "polite"}>
        {phase} ／ {hidden ? "画面が非表示のため停止中" : playing ? "ループ送信中" : "一時停止中"}
      </p>
      <div className="qr-controls">
        <Button onClick={() => setPlaying((value) => !value)}>
          {playing ? "一時停止" : "ループ送信を開始"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setPlaying(false);
            setPosition((current) => (current + transfer.count + 1) % (transfer.count + 2));
          }}
        >
          前のQR
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setPlaying(false);
            setPosition((current) => (current + 1) % (transfer.count + 2));
          }}
        >
          次のQR
        </Button>
      </div>
      <div className="qr-controls">
        <label>
          切替間隔（秒）
          <input
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            value={intervalInput}
            onChange={(e) => {
              const value = e.target.value;
              setIntervalInput(value);
              const units = Number(value) * 10;
              if (
                Number.isFinite(units) &&
                units >= 1 &&
                units <= 21474836 &&
                Math.abs(units - Math.round(units)) < 1e-6
              )
                setIntervalMs(Math.round(units) * 100);
            }}
            onBlur={() => setIntervalInput((interval / 1000).toFixed(1))}
          />
        </label>
        <Button
          variant="outline"
          aria-label="切替間隔を0.1秒短くする"
          disabled={interval <= 100}
          onClick={() => {
            const next = interval - 100;
            setIntervalMs(next);
            setIntervalInput((next / 1000).toFixed(1));
          }}
        >
          −0.1秒
        </Button>
        <Button
          variant="outline"
          aria-label="切替間隔を0.1秒長くする"
          disabled={interval >= 2147483600}
          onClick={() => {
            const next = interval + 100;
            setIntervalMs(next);
            setIntervalInput((next / 1000).toFixed(1));
          }}
        >
          ＋0.1秒
        </Button>
        <label>
          データ番号
          <input
            type="number"
            min={1}
            max={transfer.count}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const value = Number(number);
            if (Number.isInteger(value) && value >= 1 && value <= transfer.count) {
              setPosition(value);
              setPlaying(false);
            }
          }}
        >
          この番号を表示
        </Button>
      </div>
      <p className="qr-help">
        受信側が「受信完了」になったら送信を停止してください。読み取りにくい場合は画面を明るくし、距離・ピント・切替間隔を調整してください。QRを見られるとデータも読み取られます。
      </p>
    </section>
  );
}
export function Receiver({
  dirty,
  onReceive,
}: {
  dirty: boolean;
  onReceive: (project: Project) => void;
}) {
  const receiver = useRef(new TransferReceiver());
  const camera = useRef<CameraSession | null>(null);
  const abort = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const alive = useRef(true);
  const verifying = useRef(false);
  const lastText = useRef<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState(
    "カメラを開始して、送信側のQRを画面に大きく映してください。",
  );
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [progress, setProgress] = useState({ received: 0, total: 0, missing: [] as number[] });
  const [received, setReceived] = useState<Project | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const completion = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (received) {
      completion.current?.scrollIntoView?.({ block: "start" });
      completion.current?.focus({ preventScroll: true });
    }
  }, [received]);
  const stopResources = useCallback(() => {
    epoch.current++;
    abort.current?.abort();
    camera.current?.stop();
    camera.current = null;
  }, []);
  const stopCamera = useCallback(() => {
    stopResources();
    setRunning(false);
    setStarting(false);
  }, [stopResources]);
  useEffect(() => {
    alive.current = true;
    const visibility = () => {
      if (document.hidden) {
        stopCamera();
        setStatus("カメラを停止しました。戻ったら再開できます。受信済みQRは保持しています。");
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      stopResources();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stopCamera, stopResources]);
  function accept(text: string) {
    if (verifying.current || lastText.current === text) return;
    lastText.current = text;
    const target = receiver.current;
    try {
      const result = target.accept(text);
      if (result === "ignored" || result === "duplicate") return;
      if (result === "other") {
        setStatus("別の送信のQRを読み飛ばしました。同じ送信画面にカメラを向けてください。");
        return;
      }
      setError(null);
      setProgress({
        received: target.received,
        total: target.info!.count,
        missing: target.missing(),
      });
      if (result === "start")
        setStatus("開始QRを読み取りました。受信済みデータを保持して続けます。");
      else if (result === "end") setStatus("終了QRを読み取りました。不足分は次の周回で補います。");
      else setStatus("データ受信中。途中からの読み取りも、そのまま続けられます。");
      if (target.received === target.info!.count && !target.ready)
        setStatus("全データを受信しました。終了QRを読み取るまでカメラを向けたままお待ちください。");
      if (target.ready) {
        verifying.current = true;
        setChecking(true);
        stopCamera();
        setStatus("全データと終了QRが揃いました。内容を検証中…");
        void target
          .finish()
          .then(
            (project) => {
              if (alive.current && receiver.current === target) {
                setReceived(project);
                setStatus("受信完了。内容を確認して取り込んでください。");
              }
            },
            (failure) => {
              if (alive.current && receiver.current === target)
                setError(
                  `検証に失敗しました：${message(failure)}「受信をリセット」してやり直してください。`,
                );
            },
          )
          .finally(() => {
            if (receiver.current === target) {
              verifying.current = false;
              if (alive.current) setChecking(false);
            }
          });
      }
    } catch (failure) {
      setError(message(failure));
    }
  }
  async function start() {
    stopCamera();
    const token = epoch.current;
    const controller = new AbortController();
    abort.current = controller;
    setStarting(true);
    setError(null);
    lastText.current = null;
    try {
      const session = await startCamera(
        video.current!,
        (text) => {
          if (alive.current && epoch.current === token) accept(text);
        },
        (failure) => {
          if (alive.current && epoch.current === token) {
            stopCamera();
            setError(message(failure));
          }
        },
        deviceId || undefined,
        controller.signal,
      );
      if (!alive.current || epoch.current !== token) {
        session.stop();
        return;
      }
      camera.current = session;
      setDevices(session.devices);
      setRunning(true);
      setStatus("カメラ起動済み。開始・データ・終了のどのQRからでも読み取れます。");
    } catch (failure) {
      if (alive.current && epoch.current === token)
        setError(
          `カメラを開始できませんでした：${message(failure)} カメラの許可・接続を確認してください。`,
        );
    } finally {
      if (alive.current && epoch.current === token) setStarting(false);
    }
  }
  function reset() {
    stopCamera();
    receiver.current = new TransferReceiver();
    verifying.current = false;
    setChecking(false);
    lastText.current = null;
    setProgress({ received: 0, total: 0, missing: [] });
    setReceived(null);
    setConfirmed(false);
    setError(null);
    setStatus("受信をリセットしました。カメラを開始してください。");
  }
  if (received)
    return (
      <section aria-label="受信完了の確認">
        <h3 ref={completion} tabIndex={-1}>
          受信完了。内容を確認して取り込んでください。
        </h3>
        <p>
          まだ編集画面には反映していません。下の「この内容を取り込む」で編集を再開できます。送信側のループは停止してください。
        </p>

        <div className="qr-received">
          <p>プロジェクト：{received.title || "名称なし"}</p>
          <p>氏名：{received.profile.name || "未入力"}</p>
          {dirty && (
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              現在の未保存変更を置き換えることを確認しました
            </label>
          )}
          <Button disabled={dirty && !confirmed} onClick={() => onReceive(received)}>
            この内容を取り込む
          </Button>
          <p>取り込んだ内容は未保存です。JSONへの保存を行ってください。</p>
        </div>

        <Button variant="outline" onClick={reset}>
          受信をリセット
        </Button>
      </section>
    );
  return (
    <section aria-label="QR受信">
      {!received && (
        <>
          <video
            ref={video}
            className="qr-camera"
            autoPlay
            playsInline
            muted
            aria-label="QR読み取りカメラ"
          />
          <div className="qr-controls">
            <Button
              disabled={starting || checking}
              onClick={() => {
                if (running) {
                  stopCamera();
                  setStatus("カメラを停止しました。受信済みQRは保持しています。");
                } else void start();
              }}
            >
              {starting ? "カメラを起動中…" : running ? "カメラを停止" : "カメラを開始"}
            </Button>
            {devices.length > 1 && (
              <label>
                カメラ
                <select
                  value={deviceId}
                  disabled={starting}
                  onChange={(e) => {
                    stopCamera();
                    setDeviceId(e.target.value);
                  }}
                >
                  <option value="">背面を優先（自動）</option>
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `カメラ ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </>
      )}
      <output>{status}</output>
      {progress.total > 0 && (
        <>
          <progress aria-label="QR受信進捗" value={progress.received} max={progress.total} />
          <p>
            {progress.received} / {progress.total}枚受信
          </p>
          {progress.missing.length > 0 && (
            <p>
              未受信の番号：{progress.missing.join("、")}
              {progress.total - progress.received > progress.missing.length ? " …" : ""}
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <Button variant="outline" onClick={reset}>
        受信をリセット
      </Button>
    </section>
  );
}
