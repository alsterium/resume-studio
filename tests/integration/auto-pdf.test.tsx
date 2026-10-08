import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient, type GeneratedDocument } from "../../src/infrastructure/app-client";
import { AUTO_PDF_STORAGE_KEY } from "../../src/features/preview/useAutoPdf";
import type { Project } from "../../src/domain/project";
import fullProject from "../fixtures/project-full.json";

// Scheduling tests cover the IPC snapshot/read boundary; native E2E renders the PDF.
vi.mock("../../src/features/preview/PdfPreview", () => ({
  PdfPreview: ({ bytes }: { bytes: Uint8Array }) => (
    <output aria-label="自動生成PDFの読込">{bytes.length}</output>
  ),
}));

type Request = { project: typeof fullProject; kind: string; revision: number; jobId: string };
let requests: Request[];
let hold: boolean;
let fail: boolean;
let cancelFails: boolean;
let complete: (() => void) | undefined;
let cancel: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  requests = [];
  hold = false;
  fail = false;
  cancelFails = false;
  complete = undefined;
  cancel = undefined;
  mockIPC((command, args) => {
    if (command === "generate_document") {
      const request = args as Request;
      requests.push(structuredClone(request));
      const result = {
        projectId: request.project.projectId,
        revision: request.revision,
        kind: request.kind,
        jobId: request.jobId,
        resultId: request.jobId,
      } as GeneratedDocument;
      if (fail) throw "TeX環境を確認してください";
      if (hold)
        return new Promise((resolve, reject) => {
          complete = () => resolve(result);
          cancel = () => reject("PDF生成をキャンセルしました。 (CANCELED)");
        });
      return result;
    }
    if (command === "cancel_generation") {
      if (cancelFails) throw "停止要求に失敗";
      cancel?.();
      return true;
    }
    if (command === "read_pdf") return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    if (command === "open_project")
      return { project: structuredClone(fullProject), fileId: "opened", displayName: "架空.json" };
    throw new Error(command);
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

async function tick(ms = 0) {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function option() {
  fireEvent.click(screen.getByRole("button", { name: "設定" }));
  return screen.getByRole("checkbox", { name: "PDFを自動生成する" });
}
function closeSettings() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
}
function selectDocument(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}

test("既定OFF、ON設定の保持、書類の初回表示と同じプロジェクトの再読込で生成する", async () => {
  const view = render(<DraftWorkspace client={tauriClient} />);
  await tick(5000);
  expect(requests).toHaveLength(0);
  const checkbox = option();
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  expect(localStorage.getItem(AUTO_PDF_STORAGE_KEY)).toBe("true");
  closeSettings();
  await tick();
  expect(requests.map((r) => r.kind)).toEqual(["resume"]);
  selectDocument("職務経歴書");
  await tick();
  expect(requests.map((r) => r.kind)).toEqual(["resume", "career"]);
  selectDocument("履歴書");
  await tick(5000);
  expect(requests).toHaveLength(2);
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    await tick();
    expect(requests).toHaveLength(3 + i);
    expect(requests.at(-1)?.project.projectId).toBe(fullProject.projectId);
  }
  view.unmount();
  render(<DraftWorkspace client={tauriClient} />);
  expect(option()).toBeChecked();
  closeSettings();
  await tick();
  expect(requests).toHaveLength(5);
});

test("連続入力とIMEを待ち、生成中の編集を直列で反映し、OFFで待機を解除する", async () => {
  localStorage.setItem(AUTO_PDF_STORAGE_KEY, "true");
  render(<DraftWorkspace client={tauriClient} />);
  await tick();
  const name = screen.getByLabelText("氏名");
  fireEvent.change(name, { target: { value: "架空A" } });
  await tick(1500);
  fireEvent.change(name, { target: { value: "架空B" } });
  await tick(1999);
  expect(requests).toHaveLength(1);
  fireEvent.compositionStart(name);
  fireEvent.change(name, { target: { value: "架空変換中" } });
  await tick(5000);
  expect(requests).toHaveLength(1);
  fireEvent.compositionEnd(name);
  hold = true;
  await tick(2000);
  expect(requests).toHaveLength(2);
  fireEvent.change(name, { target: { value: "生成中の追加編集" } });
  await tick(5000);
  expect(requests).toHaveLength(2);
  hold = false;
  await act(async () => complete?.());
  await tick(2000);
  expect(requests).toHaveLength(3);
  expect(requests.at(-1)?.project.profile.name).toBe("生成中の追加編集");
  expect(screen.queryByText("PDFは更新前の内容です。")).not.toBeInTheDocument();
  fireEvent.change(name, { target: { value: "OFFにする" } });
  fireEvent.click(option());
  closeSettings();
  await tick(5000);
  expect(requests).toHaveLength(3);
  expect(localStorage.getItem(AUTO_PDF_STORAGE_KEY)).toBe("false");
});

test("失敗・キャンセルで無限再試行せず、手動更新と次の編集では再生成する", async () => {
  localStorage.setItem(AUTO_PDF_STORAGE_KEY, "true");
  fail = true;
  render(<DraftWorkspace client={tauriClient} />);
  await tick();
  await tick(10000);
  expect(requests).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("TeX環境を確認してください");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  await tick(5000);
  expect(requests).toHaveLength(2);
  hold = true;
  fireEvent.change(screen.getByLabelText("氏名"), { target: { value: "キャンセルする編集" } });
  await tick(2000);
  expect(requests).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("氏名"), { target: { value: "停止失敗中の追加編集" } });
  cancelFails = true;
  fireEvent.click(screen.getByRole("button", { name: "生成をキャンセル" }));
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("停止要求に失敗");
  hold = false;
  await act(async () => complete?.());
  await tick(2000);
  expect(requests).toHaveLength(4);
  expect(requests.at(-1)?.project.profile.name).toBe("停止失敗中の追加編集");
  hold = true;
  cancelFails = false;
  fireEvent.change(screen.getByLabelText("氏名"), { target: { value: "停止する" } });
  await tick(2000);
  expect(requests).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "生成をキャンセル" }));
  await tick(10000);
  expect(requests).toHaveLength(5);
  expect(screen.getByLabelText("生成状態")).toHaveTextContent("生成をキャンセルしました");
  hold = false;
  fireEvent.change(screen.getByLabelText("氏名"), { target: { value: "新しい編集" } });
  await tick(2000);
  expect(requests).toHaveLength(6);
});

test("今日モードは日跨ぎで表示日付と自動PDFを更新し、指定日モードでは再生成しない", async () => {
  vi.setSystemTime(new Date(2027, 0, 1, 23, 59, 59));
  localStorage.setItem(AUTO_PDF_STORAGE_KEY, "true");
  render(<DraftWorkspace client={tauriClient} />);
  await tick();
  fireEvent.change(screen.getByLabelText("書類日付の設定"), { target: { value: "today" } });
  await tick(2000);
  expect(screen.getByLabelText("書類日付")).toHaveValue("2027-01-02");
  const count = requests.length;
  await tick(24 * 60 * 60 * 1000);
  expect(screen.getByLabelText("書類日付")).toHaveValue("2027-01-03");
  await tick(2000);
  expect(requests.length).toBeGreaterThan(count);
  expect((requests.at(-1)!.project as Project).documentDateMode).toBe("today");
  fireEvent.change(screen.getByLabelText("書類日付の設定"), { target: { value: "fixed" } });
  await tick(2000);
  const fixedCount = requests.length;
  await tick(24 * 60 * 60 * 1000 + 2000);
  expect(requests).toHaveLength(fixedCount);
});
