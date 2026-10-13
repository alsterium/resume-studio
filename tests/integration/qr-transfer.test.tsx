import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { Sender, Receiver } from "../../src/features/transfer/TransferPanel";
import { WebWorkspace } from "../../src/WebApp";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";
import { startCamera } from "../../src/features/transfer/camera";
import { prepareTransfer, frameText } from "../../src/features/transfer/protocol";
import { beginSession } from "../../src/domain/session";
import { newProject } from "../../src/domain/new-project";
import { validateProject } from "../../src/domain/validate-project";
import fixture from "../fixtures/project-full.json";
import { installQrCrypto } from "../qr-crypto";
vi.mock("../../src/features/transfer/camera", () => ({ startCamera: vi.fn() }));
installQrCrypto();
const project = validateProject(structuredClone(fixture));
let deliver: (text: string) => void;
let failCamera: (failure: unknown) => void;
let stop: Mock<() => void>;
beforeEach(() => {
  stop = vi.fn();
  vi.mocked(startCamera).mockImplementation(async (_video, onFrame, onError) => {
    deliver = onFrame;
    failCamera = onError;
    return { stop, devices: [] };
  });
});
afterEach(() => {
  vi.useRealTimers();
});
async function deliverProject() {
  const transfer = await prepareTransfer(project);
  await act(async () => {
    deliver(frameText(transfer, "B"));
    for (let i = 0; i < transfer.count; i++) deliver(frameText(transfer, "D", i));
    deliver(frameText(transfer, "E"));
  });
  await screen.findByText("受信完了。内容を確認して取り込んでください。");
}

test("500msごとに開始→データ→終了→開始をループし、一時停止・番号指定ができる", async () => {
  render(<Sender project={project} />);
  await screen.findByText(/開始QR ／ 一時停止中/);
  const transfer = await prepareTransfer(project);
  vi.useFakeTimers();
  fireEvent.click(screen.getByText("ループ送信を開始"));
  act(() => {
    vi.advanceTimersByTime(499);
  });
  expect(screen.getByText(/開始QR ／ ループ送信中/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByText(/データQR 1/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(500 * transfer.count);
  });
  expect(screen.getByText(/終了QR ／ ループ送信中/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(screen.getByText(/開始QR ／ ループ送信中/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("一時停止"));
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByText(/開始QR ／ 一時停止中/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("データ番号"), { target: { value: "1" } });
  fireEvent.click(screen.getByText("この番号を表示"));
  expect(screen.getByText(/データQR 1/)).toBeInTheDocument();
});

test("切替間隔を0.01〜0.09秒で表示し、0.01秒刻みの増減と不正値保護を確認する", async () => {
  render(<Sender project={project} />);
  await screen.findByText(/開始QR ／ 一時停止中/);
  const input = screen.getByLabelText("切替間隔（秒）");
  expect(input).toHaveAttribute("min", "0.01");
  expect(input).toHaveAttribute("step", "0.01");
  vi.useFakeTimers();
  for (let units = 9; units >= 1; units--) {
    fireEvent.change(input, { target: { value: (units / 100).toFixed(2) } });
    expect(input).toHaveValue(units / 100);
    fireEvent.click(screen.getByText("ループ送信を開始"));
    act(() => {
      vi.advanceTimersByTime(units * 10 - 1);
    });
    expect(screen.getByText(/開始QR ／ ループ送信中/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(/データQR 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("一時停止"));
    fireEvent.click(screen.getByText("前のQR"));
  }
  expect(screen.getByLabelText("切替間隔を0.01秒短くする")).toBeDisabled();
  for (const value of ["", "0", "-0.01", "0.015", "9999999999"]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    expect(input).toHaveValue(0.01);
  }
  fireEvent.click(screen.getByLabelText("切替間隔を0.01秒長くする"));
  expect(input).toHaveValue(0.02);
  fireEvent.click(screen.getByText("ループ送信を開始"));
  act(() => {
    vi.advanceTimersByTime(19);
  });
  expect(screen.getByText(/開始QR ／ ループ送信中/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByText(/データQR 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("切替間隔を0.01秒短くする"));
  expect(input).toHaveValue(0.01);
});

test("終了QR不足では現在の内容を変更せず、確認後だけ取り込み、カメラを解放する", async () => {
  const receive = vi.fn();
  render(<Receiver dirty onReceive={receive} />);
  fireEvent.click(screen.getByText("カメラを開始"));
  await screen.findByText("カメラを停止");
  const transfer = await prepareTransfer(project);
  act(() => {
    for (let i = 0; i < transfer.count; i++) deliver(frameText(transfer, "D", i));
  });
  expect(receive).not.toHaveBeenCalled();
  expect(screen.getByText(/終了QRを読み取るまでカメラを向けたまま/)).toBeInTheDocument();
  expect(screen.queryByText("この内容を取り込む")).not.toBeInTheDocument();
  await act(async () => {
    deliver(frameText(transfer, "E"));
  });
  await screen.findByText("受信完了。内容を確認して取り込んでください。");
  expect(stop).toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: "受信完了。内容を確認して取り込んでください。" }),
  ).toHaveFocus();
  expect(screen.queryByLabelText("QR読み取りカメラ")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("QR受信進捗")).not.toBeInTheDocument();
  expect(screen.getByText(/まだ編集画面には反映していません/)).toBeInTheDocument();
  expect(screen.getByText("この内容を取り込む")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("現在の未保存変更を置き換えることを確認しました"));
  fireEvent.click(screen.getByText("この内容を取り込む"));
  expect(receive).toHaveBeenCalledWith(project);
});

test("権限拒否/読み取り障害を表示し、リセットと閉じる操作は受信内容を適用しない", async () => {
  vi.mocked(startCamera).mockRejectedValueOnce(new Error("NotAllowedError"));
  const receive = vi.fn();
  const view = render(<Receiver dirty={false} onReceive={receive} />);
  fireEvent.click(screen.getByText("カメラを開始"));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("NotAllowedError");
  fireEvent.click(screen.getByText("カメラを開始"));
  await screen.findByText("カメラを停止");
  act(() => {
    failCamera(new Error("camera disconnected"));
  });
  expect(stop).toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("disconnected");
  fireEvent.click(screen.getByText("受信をリセット"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.unmount();
  expect(receive).not.toHaveBeenCalled();
});

test("許可待ちに閉じた場合はabortし、遅れて返ったカメラも停止する", async () => {
  let resolve!: (value: { stop: () => void; devices: MediaDeviceInfo[] }) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(startCamera).mockImplementation((_v, _f, _e, _d, s) => {
    signal = s;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const view = render(<Receiver dirty={false} onReceive={vi.fn()} />);
  fireEvent.click(screen.getByText("カメラを開始"));
  expect(signal!.aborted).toBe(false);
  view.unmount();
  expect(signal!.aborted).toBe(true);
  await act(async () => {
    resolve({ stop, devices: [] });
  });
  expect(stop).toHaveBeenCalledOnce();
});

for (const platform of ["web", "mac"] as const)
  test(`${platform}: QR受信を未保存の別プロジェクトとして取り込み、元の保存先を上書きしない`, async () => {
    const old = newProject();
    old.profile.name = "編集中";
    const saved = vi.fn();
    if (platform === "web")
      render(
        <WebWorkspace
          initial={{ session: beginSession(old), filename: "old.json" }}
          store={{ read: async () => null, write: async () => {} }}
        />,
      );
    else {
      mockIPC((command, args) => {
        if (command === "open_project")
          return { project: old, fileId: "old-file", displayName: "old.json" };
        if (command === "save_project") {
          saved(args);
          return { fileId: "new-file", displayName: "new.json" };
        }
        return null;
      });
      render(<DraftWorkspace client={tauriClient} />);
      fireEvent.click(screen.getByText("開く"));
      await waitFor(() => expect(screen.getByLabelText("氏名")).toHaveValue("編集中"));
    }
    fireEvent.change(screen.getByLabelText("氏名"), { target: { value: "未保存の入力" } });
    fireEvent.click(screen.getByText("QR転送"));
    await screen.findByText("受信モード");
    fireEvent.click(screen.getByText("受信モード"));
    fireEvent.click(screen.getByText("カメラを開始"));
    await screen.findByText("カメラを停止");
    await deliverProject();
    expect(screen.getByLabelText("氏名")).toHaveValue("未保存の入力");
    fireEvent.click(screen.getByLabelText("現在の未保存変更を置き換えることを確認しました"));
    fireEvent.click(screen.getByText("この内容を取り込む"));
    await waitFor(() => expect(screen.getByLabelText("氏名")).toHaveValue(project.profile.name));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/JSONは未保存/)).toBeInTheDocument();
    if (platform === "mac") {
      fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
      await waitFor(() =>
        expect(saved).toHaveBeenCalledWith({ project, fileId: null, saveAs: false }),
      );
    }
  });
