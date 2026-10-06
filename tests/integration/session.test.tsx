import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { listen } from "@tauri-apps/api/event";
import { expect, test, vi } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";

test("保存中に追加入力しても未保存を維持し、保存の失敗やキャンセルでは解消しない", async () => {
  let finish: ((value: unknown) => void) | undefined;
  let mode = "pending";
  mockIPC((command) => {
    expect(command).toBe("save_project");
    if (mode === "pending")
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (mode === "fail") throw "保存失敗";
    if (mode === "cancel") return null;
    return { fileId: "2", displayName: "保存.json" };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await user.type(screen.getByLabelText("氏名"), "保存開始");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await user.type(screen.getByLabelText("氏名"), "後の追加入力");
  await act(async () => {
    finish?.({ fileId: "1", displayName: "保存.json" });
  });
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
  mode = "fail";
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失敗");
  mode = "cancel";
  await user.click(screen.getByRole("button", { name: "名前を付けて保存" }));
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
  mode = "success";
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
});

test("新規作成の確認でキャンセルは編集を保持し、破棄は入力を空にする", async () => {
  mockIPC(() => {
    throw new Error("No file command expected");
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await user.type(screen.getByLabelText("本文"), "残す本文");
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByLabelText("本文")).toHaveAttribute("contenteditable", "false");
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(screen.getByLabelText("本文")).toHaveTextContent("残す本文");
  expect(screen.getByLabelText("本文")).toHaveAttribute("contenteditable", "true");
  await user.click(screen.getByRole("button", { name: "新規" }));
  await user.click(screen.getByRole("button", { name: "保存せず続行" }));
  expect(screen.getByLabelText("本文")).toHaveTextContent("");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("新規プロジェクト");
});

test("保存して開くは保存失敗・保存先キャンセルで止まり、成功後だけ読み込む", async () => {
  let mode = "fail";
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "save_project") {
      if (mode === "fail") throw "保存失敗";
      if (mode === "cancel") return null;
      return { fileId: "1", displayName: "保存.json" };
    }
    expect(command).toBe("open_project");
    throw "読み込み失敗";
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await user.type(screen.getByLabelText("氏名"), "保持する名前");
  await user.click(screen.getByRole("button", { name: "開く" }));
  await user.click(screen.getByRole("button", { name: "保存して続行" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失敗");
  expect(screen.getByRole("dialog")).toBeVisible();
  mode = "cancel";
  await user.click(screen.getByRole("button", { name: "保存して続行" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(commands).toEqual(["save_project", "save_project"]);
  mode = "success";
  await user.click(screen.getByRole("button", { name: "保存して続行" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("読み込み失敗");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("氏名")).toHaveValue("保持する名前");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
});

test("native終了要求は最新の編集を確認し、保存して続行した時だけ終了する", async () => {
  let requested: (() => void) | undefined;
  vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
    requested = () => handler({ event: "resume-studio:request-close", id: 1, payload: null });
    return () => {};
  });
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "save_project") return { fileId: "1", displayName: "保存.json" };
    expect(command).toBe("finish_app_close");
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await waitFor(() => expect(requested).toBeTypeOf("function"));
  await user.type(screen.getByLabelText("氏名"), "終了前の編集");
  act(() => requested?.());
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(commands).toEqual([]);
  expect(screen.getByLabelText("氏名")).toHaveValue("終了前の編集");
  act(() => requested?.());
  await user.click(screen.getByRole("button", { name: "保存して続行" }));
  expect(commands).toEqual(["save_project", "finish_app_close"]);
});
