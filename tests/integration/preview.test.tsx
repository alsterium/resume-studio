import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test, vi } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";

const renderer = vi.hoisted(() => ({ load: vi.fn(), page: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/infrastructure/pdf-runtime", () => ({
  loadPdf: (bytes: Uint8Array) => {
    renderer.load(bytes);
    return {
      destroy: renderer.destroy,
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (page: number) => {
          renderer.page(page);
          return {
            getViewport: ({ scale }: { scale: number }) => ({
              width: 600 * scale,
              height: 800 * scale,
            }),
            render: () => ({ promise: Promise.resolve(), cancel() {} }),
          };
        },
      }),
    };
  },
}));

test("入力をIPCで生成し、結果IDから読込・ページ移動・拡大を行う", async () => {
  const user = userEvent.setup();
  mockIPC((command, args) => {
    if (command === "generate_draft") {
      expect(args).toEqual({
        draft: {
          name: "架空 山田",
          body: "",
          richBody: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "日本語 & %" }] }],
          },
        },
      });
      return { resultId: "42" };
    }
    if (command === "read_pdf") {
      expect(args).toEqual({ resultId: "42" });
      return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    }
    throw new Error(command);
  });
  render(<DraftWorkspace client={tauriClient} />);
  await user.type(screen.getByLabelText("氏名"), "架空 山田");
  await user.type(screen.getByLabelText("本文"), "日本語 & %");
  await user.click(screen.getByRole("button", { name: "PDF更新" }));
  expect(await screen.findByLabelText("ページ番号")).toHaveTextContent("1 / 3");
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("data-rendered-page", "1"),
  );
  expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "次のページ" }));
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("data-rendered-page", "2"),
  );
  await user.selectOptions(screen.getByLabelText("表示倍率"), "1.5");
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("width", "900"),
  );
  expect(renderer.load).toHaveBeenCalledWith(new Uint8Array([37, 80, 68, 70, 45]));
  expect(renderer.page).toHaveBeenCalledWith(2);
});

test("編集後のPDFを古い内容として示し、再生成の失敗でも成功PDFを保持する", async () => {
  let fail = false;
  mockIPC((command) => {
    if (command === "generate_draft") {
      if (fail) throw "TeX生成に失敗";
      return { resultId: "1" };
    }
    return new Uint8Array([37, 80, 68, 70, 45]).buffer;
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "PDF更新" }));
  const canvas = await screen.findByLabelText("生成されたPDFページ");
  await user.type(screen.getByLabelText("氏名"), "更新した名前");
  expect(screen.getByText("PDFは更新前の内容です。")).toBeVisible();
  fail = true;
  await user.click(screen.getByRole("button", { name: "PDF更新" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("TeX生成に失敗");
  expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
  expect(screen.getByRole("button", { name: "PDF更新" })).toBeEnabled();
});
