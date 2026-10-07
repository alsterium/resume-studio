import { openSummary, projectMenu } from "../ui-navigation";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";
import { validateProject } from "../../src/domain/validate-project";
import fixture from "../fixtures/project-full.json";

test("読み込みで本文を復元し、未編集の書類・写真を含む全項目を保存と別名保存へ渡す", async () => {
  const project = validateProject(structuredClone(fixture));
  project.career.summary = project.resume.motivation;
  let saves = 0;
  mockIPC((command, args) => {
    if (command === "open_project") {
      return { project, fileId: "1", displayName: "応募 書類.json" };
    }
    expect(command).toBe("save_project");
    expect(args).toEqual({ project, fileId: saves === 0 ? "1" : "2", saveAs: saves > 0 });
    saves += 1;
    return { fileId: String(saves + 1), displayName: saves === 1 ? "応募 書類.json" : "別名.json" };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await openSummary(user);
  await user.click(screen.getByRole("button", { name: "開く" }));
  expect(screen.getByLabelText("氏名")).toHaveValue(project.profile.name);
  const editor = screen.getByLabelText("本文");
  expect(editor.querySelector("strong")).toHaveTextContent("太字の日本語 & %");
  expect(editor.querySelector("em")).toHaveTextContent("斜体の本文");
  expect(editor.querySelector("ol")).toHaveAttribute("start", "2");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await projectMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "名前を付けて保存" }));
  expect(screen.getByLabelText("プロジェクトファイル")).toHaveTextContent("別名.json");
  expect(saves).toBe(2);
});

test("キャンセル・不正JSON・書込失敗で現在の入力と保存先を維持し、保存を再試行できる", async () => {
  let mode = "cancel";
  let savedId: string | null = null;
  mockIPC((command, args) => {
    if (command === "open_project") {
      if (mode === "invalid") {
        return {
          project: { ...fixture, schemaVersion: 2 },
          fileId: "99",
          displayName: "新版.json",
        };
      }
      return null;
    }
    expect(command).toBe("save_project");
    if (!args || Array.isArray(args) || args instanceof ArrayBuffer || args instanceof Uint8Array)
      throw new Error("Missing save arguments");
    expect(args.fileId).toBe(savedId);
    const project = validateProject(args.project);
    expect(project.profile.name).toBe("保存する名前");
    expect(project.career.summary.content?.[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "編集内容" }],
    });
    if (mode === "cancel") return null;
    if (mode === "fail") throw "保存先に一時ファイルを作れませんでした。";
    savedId = "7";
    return { fileId: savedId, displayName: "既存.json" };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await openSummary(user);
  await user.type(screen.getByLabelText("氏名"), "保存する名前");
  await user.type(screen.getByLabelText("本文"), "編集内容");
  await user.click(screen.getByRole("button", { name: "開く" }));
  await user.click(screen.getByRole("button", { name: "保存せず続行" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByLabelText("プロジェクトファイル")).toHaveTextContent("保存先未設定");
  mode = "invalid";
  await user.click(screen.getByRole("button", { name: "開く" }));
  await user.click(screen.getByRole("button", { name: "保存せず続行" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("氏名")).toHaveValue("保存する名前");
  expect(screen.getByLabelText("本文")).toHaveTextContent("編集内容");
  mode = "success";
  await user.click(screen.getByRole("button", { name: "保存" }));
  mode = "fail";
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("一時ファイル");
  expect(screen.getByLabelText("プロジェクトファイル")).toHaveTextContent("既存.json");
  mode = "success";
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("JSONを保存しました。")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(screen.getByLabelText("氏名")).toHaveValue("");
  expect(screen.getByLabelText("本文")).toHaveTextContent("");
  expect(screen.getByLabelText("プロジェクトファイル")).toHaveTextContent("保存先未設定");
});

test("保存キーが最新の入力を保存し、IME・連続キー・確認中の誤保存を防ぐ", async () => {
  const user = userEvent.setup();
  const saves: { project: typeof fixture; fileId: string | null; saveAs: boolean }[] = [];
  let release: ((value: { fileId: string; displayName: string }) => void) | undefined;
  let delayed = true;
  mockIPC((command, args) => {
    if (command !== "save_project") throw new Error(command);
    saves.push(args as (typeof saves)[number]);
    if (delayed)
      return new Promise((resolve) => {
        release = resolve;
      });
    return { fileId: "2", displayName: "別名.json" };
  });
  render(<DraftWorkspace client={tauriClient} />);
  await openSummary(user);
  const input = screen.getByLabelText("氏名");
  await user.type(input, "架空 保存名");
  fireEvent.keyDown(input, { key: "s", metaKey: true, isComposing: true });
  fireEvent.keyDown(input, { key: "s", ctrlKey: true, keyCode: 229 });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "s", metaKey: true });
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "s", ctrlKey: true, altKey: true });
  expect(saves).toHaveLength(0);
  fireEvent.keyDown(input, { key: "s", metaKey: true });
  fireEvent.keyDown(input, { key: "s", metaKey: true });
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({
    saveAs: false,
    fileId: null,
    project: { profile: { name: "架空 保存名" } },
  });
  await user.type(input, " 追記");
  await act(async () => {
    release?.({ fileId: "1", displayName: "応募.json" });
  });
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
  delayed = false;
  fireEvent.keyDown(input, { key: "S", ctrlKey: true, shiftKey: true });
  expect(saves).toHaveLength(2);
  expect(saves[1]).toMatchObject({
    saveAs: true,
    fileId: "1",
    project: { profile: { name: "架空 保存名 追記" } },
  });
  await screen.findByText("JSONを保存しました。");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
  await user.click(screen.getByLabelText("本文"));
  await user.keyboard("{Control>}s{/Control}");
  expect(saves).toHaveLength(3);
  expect(saves[2]).toMatchObject({ saveAs: false, fileId: "2" });
  expect(saves[2].project.career.summary).toEqual(saves[1].project.career.summary);
  await user.type(input, " 未保存");
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  fireEvent.keyDown(input, { key: "s", metaKey: true });
  expect(saves).toHaveLength(3);
});
