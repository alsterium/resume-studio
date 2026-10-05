import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";
import { TexDiagnosticsPanel } from "../../src/features/diagnostics/TexDiagnosticsPanel";
import { tauriClient } from "../../src/infrastructure/app-client";

test("依存不足を表示し、再診断で日本語PDF成功へ回復できる", async () => {
  let ready = false;
  mockIPC((command) => {
    expect(command).toBe("diagnose_tex");
    return {
      tools: [
        {
          name: "latexmk",
          path: ready ? "/fixture/latexmk" : null,
          version: ready ? "4.88" : null,
        },
      ],
      missingDependencies: ready ? [] : ["latexmk"],
      pdfValidated: ready,
      error: ready
        ? null
        : { code: "TEX_NOT_FOUND", message: "PDF生成に必要なTeX環境が不足しています。", log: "" },
    };
  });
  render(<TexDiagnosticsPanel client={tauriClient} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "TeX環境を確認" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("TeX環境が不足");
  expect(screen.getByText("latexmk")).toBeVisible();
  ready = true;
  await user.click(screen.getByRole("button", { name: "TeX環境を確認" }));
  expect(await screen.findByText("日本語PDFを生成できました。")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("診断のIPC失敗を表示し、再実行可能に戻す", async () => {
  mockIPC(() => {
    throw new Error("IPC unavailable");
  });
  render(<TexDiagnosticsPanel client={tauriClient} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "TeX環境を確認" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("もう一度お試しください");
  expect(screen.getByRole("button", { name: "TeX環境を確認" })).toBeEnabled();
});
