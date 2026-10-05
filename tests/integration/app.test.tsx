import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";
import { App } from "../../src/App";
import { tauriClient } from "../../src/infrastructure/app-client";
import metadata from "../../package.json";

test("Tauri adapterからアプリ情報を取得し、両書類を選択できる", async () => {
  mockIPC((command) => {
    if (command === "plugin:app|version") return metadata.version;
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<App client={tauriClient} />);
  expect(await screen.findByText(`バージョン ${metadata.version}`)).toBeVisible();
  expect(screen.getByRole("heading", { name: "履歴書", level: 2 })).toBeVisible();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "職務経歴書" }));
  expect(screen.getByRole("heading", { name: "職務経歴書", level: 2 })).toBeVisible();
  expect(screen.getByRole("button", { name: "職務経歴書" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("aria-pressed", "false");

  await user.click(screen.getByRole("button", { name: "履歴書" }));
  expect(screen.getByRole("heading", { name: "履歴書", level: 2 })).toBeVisible();
});

test("IPC失敗を表示しても書類を選択できる", async () => {
  mockIPC(() => {
    throw new Error("IPC unavailable");
  });
  render(<App client={tauriClient} />);
  expect(await screen.findByText("アプリ情報を取得できませんでした。")).toBeVisible();
  await userEvent.setup().click(screen.getByRole("button", { name: "職務経歴書" }));
  expect(screen.getByRole("heading", { name: "職務経歴書", level: 2 })).toBeVisible();
});
