import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { test, expect } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";
import { mockIPC } from "@tauri-apps/api/mocks";

test("C案の項目と書類を往復しても入力、書式、エディタ履歴を保持する", async () => {
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    return null;
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  const input = screen.getByLabelText("氏名");
  await user.type(input, "架空 氏名");
  const motivation = screen.getByRole("textbox", {
    name: "志望動機・特技・アピールポイント",
    hidden: true,
  });
  expect(motivation).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "志望動機を編集" }));
  await user.click(motivation);
  await user.click(screen.getByRole("button", { name: "太字" }));
  await user.type(motivation, "保持する志望動機");
  await user.click(screen.getByRole("button", { name: "志望動機を編集" }));
  expect(motivation).not.toBeVisible();
  await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
  expect(screen.getByRole("heading", { name: "職務経歴書", level: 2 })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "職務要約を編集" }));
  await user.type(screen.getByRole("textbox", { name: "本文" }), "保持する要約");
  await user.click(screen.getByRole("tab", { name: "履歴書" }));
  await user.click(screen.getByRole("button", { name: "志望動機を編集" }));
  expect(screen.getByRole("textbox", { name: "志望動機・特技・アピールポイント" })).toBe(
    motivation,
  );
  expect(motivation.querySelector("strong")).toHaveTextContent("保持する志望動機");
  expect(input).toHaveValue("架空 氏名");
  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(motivation).toHaveTextContent("");
  await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
  expect(screen.getByRole("textbox", { name: "本文" })).toHaveTextContent("保持する要約");
  expect(commands).toEqual([]);
});

test("設定と書き出しをEscapeで閉じると起動ボタンへフォーカスを戻す", async () => {
  mockIPC(() => null);
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  for (const name of ["設定", "書き出し"]) {
    const trigger = screen.getByRole("button", { name });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  }
});
