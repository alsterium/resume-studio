import { act, render, screen, waitFor } from "@testing-library/react";
import type { Channel } from "@tauri-apps/api/core";
import type { GeneratedDocument, JobPhase } from "../../src/infrastructure/app-client";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test, vi } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { PdfPreview } from "../../src/features/preview/PdfPreview";
import { tauriClient } from "../../src/infrastructure/app-client";
import fullProject from "../fixtures/project-full.json";

test("待機中と実行中の生成を停止し、後始末の完了まで待って成功PDFを保持する", async () => {
  const user = userEvent.setup();
  let reject: ((reason: string) => void) | undefined;
  let pending = false;
  let phase: JobPhase = "queued";
  let jobId = "";
  let cancelFails = false;
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown>;
    if (command === "generate_document") {
      jobId = args.jobId as string;
      (args.progress as Channel<JobPhase>).onmessage(phase);
      if (pending)
        return new Promise((_, fail) => {
          reject = fail;
        });
      return {
        resultId: jobId,
        jobId,
        kind: args.kind,
        revision: args.revision,
        projectId: (args.project as typeof fullProject).projectId,
      };
    }
    if (command === "cancel_generation") {
      expect(args.jobId).toBe(jobId);
      if (cancelFails) throw "停止要求に失敗";
      return true;
    }
    if (command === "read_pdf") return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    throw new Error(command);
  });
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  await screen.findByLabelText("生成されたPDFページ");
  for (const waiting of [true, false]) {
    const canvas = screen.getByLabelText("生成されたPDFページ");
    pending = true;
    phase = waiting ? "queued" : "compiling";
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    expect(screen.getByLabelText("生成状態")).toHaveTextContent(
      waiting ? "生成待ち" : "PDFを生成中",
    );
    if (waiting) {
      cancelFails = true;
      await user.click(screen.getByRole("button", { name: "生成をキャンセル" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("停止要求に失敗");
      expect(screen.getByRole("button", { name: "生成をキャンセル" })).toBeEnabled();
      cancelFails = false;
    }
    await user.click(screen.getByRole("button", { name: "生成をキャンセル" }));
    expect(screen.getByRole("button", { name: "生成をキャンセル" })).toBeDisabled();
    expect(screen.getByLabelText("生成状態")).toHaveTextContent("生成を停止中");
    expect(screen.getByRole("button", { name: "新規" })).toBeDisabled();
    await user.type(screen.getByLabelText("氏名"), "追記");
    await act(async () => {
      reject?.("PDF生成をキャンセルしました。 (CANCELED)");
    });
    expect(screen.getByLabelText("生成状態")).toHaveTextContent("生成をキャンセルしました");
    expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
    expect(screen.getByRole("button", { name: "履歴書PDF更新" })).toBeEnabled();
    pending = false;
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await waitFor(() => expect(screen.getByLabelText("生成状態")).toHaveTextContent("生成完了"));
  }
});

test("生成中も編集と書類切替ができ、書類別PDFと古いrevisionを保持する", async () => {
  const user = userEvent.setup();
  let complete: ((result: GeneratedDocument) => void) | undefined;
  let result: GeneratedDocument | undefined;
  let progress: Channel<JobPhase> | undefined;
  let fail = false;
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown> | undefined;
    if (command === "generate_document") {
      progress = args?.progress as Channel<JobPhase>;
      result = {
        resultId: args?.kind === "resume" ? "resume" : "career",
        kind: args?.kind as GeneratedDocument["kind"],
        revision: args?.revision as number,
        jobId: args?.jobId as string,
        projectId: (args?.project as typeof fullProject)?.projectId,
      };
      progress.onmessage("compiling");
      if (fail) throw "履歴書の生成失敗";
      if (args?.kind === "resume") return result;
      return new Promise<GeneratedDocument>((resolve) => {
        complete = resolve;
      });
    }
    if (command === "read_pdf") return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    throw new Error(command);
  });
  const { rerender } = render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  await screen.findByText("プレビュー：履歴書");
  expect(screen.getByLabelText("生成状態")).toHaveTextContent("履歴書：生成完了");
  rerender(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  expect(screen.queryByLabelText("生成されたPDFページ")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "職務経歴書PDF更新" }));
  expect(screen.getByLabelText("生成状態")).toHaveTextContent("職務経歴書：PDFを生成中");
  expect(screen.getByRole("button", { name: "職務経歴書PDF更新" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "新規" })).toBeDisabled();
  await user.type(screen.getByLabelText("氏名"), "生成開始後の変更");
  rerender(<DraftWorkspace client={tauriClient} document="履歴書" />);
  expect(screen.getByText("プレビュー：履歴書")).toBeVisible();
  expect(screen.getByText("PDFは更新前の内容です。")).toBeVisible();
  await act(async () => {
    complete?.(result!);
  });
  expect(screen.getByText("プレビュー：履歴書")).toBeVisible();
  // A delayed channel notification must not overwrite the finished state.
  act(() => progress?.onmessage("compiling"));
  expect(screen.getByLabelText("生成状態")).toHaveTextContent("職務経歴書：生成完了");
  rerender(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  expect(screen.getByText("プレビュー：職務経歴書")).toBeVisible();
  expect(screen.getByText("PDFは更新前の内容です。")).toBeVisible();
  rerender(<DraftWorkspace client={tauriClient} document="履歴書" />);
  await screen.findByLabelText("生成されたPDFページ");
  const canvas = screen.getByLabelText("生成されたPDFページ");
  fail = true;
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("履歴書の生成失敗");
  expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
  expect(screen.getByLabelText("生成状態")).toHaveTextContent("履歴書：生成失敗");
  fail = false;
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  await waitFor(() =>
    expect(screen.queryByText("PDFは更新前の内容です。")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "新規" }));
  await user.click(screen.getByRole("button", { name: "保存せず続行" }));
  expect(screen.queryByLabelText("生成されたPDFページ")).not.toBeInTheDocument();
  rerender(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  expect(screen.queryByLabelText("生成されたPDFページ")).not.toBeInTheDocument();
});

test("別プロジェクト・revision・書類種別の生成結果を表示せず読込失敗でも成功PDFを保つ", async () => {
  const user = userEvent.setup();
  let mode = "success";
  const readPdf = vi.fn();
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown> | undefined;
    if (command === "generate_document") {
      const result = {
        resultId: "saved",
        kind: args?.kind,
        revision: args?.revision,
        jobId: args?.jobId,
        projectId: (args?.project as typeof fullProject)?.projectId,
      };
      if (mode === "project") result.projectId = "different-project";
      if (mode === "revision") result.revision = (result.revision as number) + 1;
      if (mode === "kind") result.kind = "career";
      return result;
    }
    if (command === "read_pdf") {
      readPdf();
      if (mode === "read") throw "PDFの読み込み失敗";
      return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    }
    throw new Error(command);
  });
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  const canvas = await screen.findByLabelText("生成されたPDFページ");
  for (const invalid of ["project", "revision", "kind"]) {
    mode = invalid;
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "生成結果と編集中の書類が一致しません",
    );
    expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
    expect(readPdf).toHaveBeenCalledTimes(1);
  }
  mode = "read";
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("PDFの読み込み失敗");
  expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
  expect(screen.getByRole("button", { name: "履歴書PDF更新" })).toBeEnabled();
});

test("版付きテンプレートを明示選択し、書類全項目の生成と失敗時のPDF保持を行う", async () => {
  const user = userEvent.setup();
  let fail = false;
  let generated = false;
  const project = structuredClone(fullProject);
  project.templates.resume.version = "99.0.0";
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown> | undefined;
    if (command === "open_project") return { project, fileId: "file", displayName: "架空.json" };
    if (command === "list_templates")
      return [
        {
          id: "resume-standard",
          version: "1.0.0",
          displayName: "標準履歴書",
          documentKind: "resume",
          schemaVersions: [1],
          engine: "lualatex",
          packages: [],
          fonts: [],
        },
        {
          id: "career-standard",
          version: "1.0.0",
          displayName: "標準職務経歴書",
          documentKind: "career",
          schemaVersions: [1],
          engine: "lualatex",
          packages: [],
          fonts: [],
        },
      ];
    if (command === "generate_document") {
      if (fail) throw "生成失敗";
      expect(args).toEqual(
        expect.objectContaining({
          project: {
            ...project,
            templates: {
              ...project.templates,
              resume: { id: "resume-standard", version: "1.0.0" },
            },
          },
          kind: "resume",
          revision: expect.any(Number),
          progress: expect.any(Object),
        }),
      );
      generated = true;
      return {
        resultId: "formal",
        projectId: project.projectId,
        revision: args?.revision,
        jobId: args?.jobId,
        kind: "resume",
      };
    }
    if (command === "read_pdf") {
      expect(args).toEqual({ resultId: "formal" });
      return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    }
    throw new Error(command);
  });
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "開く" }));
  await screen.findByDisplayValue("架空 山田");
  await user.click(screen.getByRole("button", { name: "テンプレート一覧を確認" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("履歴書の指定版は同梱されていません");
  expect(screen.getByLabelText("履歴書テンプレート")).toHaveValue(
    JSON.stringify(["resume-standard", "99.0.0"]),
  );
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
  await user.selectOptions(
    screen.getByLabelText("履歴書テンプレート"),
    JSON.stringify(["resume-standard", "1.0.0"]),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  const canvas = await screen.findByLabelText("生成されたPDFページ");
  expect(generated).toBe(true);
  expect(screen.getByText("プレビュー：履歴書")).toBeVisible();
  expect(await screen.findByText(/続紙を含む3ページ/)).toBeVisible();
  await user.type(screen.getByLabelText("現住所・住所"), "追記");
  expect(screen.getByText("PDFは更新前の内容です。")).toBeVisible();
  fail = true;
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("生成失敗");
  expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
});

test("職務経歴書の生成では選択中の書類種別をIPCへ渡す", async () => {
  const user = userEvent.setup();
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown> | undefined;
    if (command === "generate_document") {
      expect(args).toEqual(expect.objectContaining({ kind: "career" }));
      return {
        resultId: "career",
        projectId: (args?.project as typeof fullProject)?.projectId,
        revision: args?.revision,
        jobId: args?.jobId,
        kind: "career",
      };
    }
    if (command === "read_pdf") return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    throw new Error(command);
  });
  render(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  await user.click(screen.getByRole("button", { name: "職務経歴書PDF更新" }));
  expect(await screen.findByText("プレビュー：職務経歴書")).toBeVisible();
  expect(screen.queryByText(/続紙を含む/)).not.toBeInTheDocument();
});

const renderer = vi.hoisted(() => ({ load: vi.fn(), page: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/infrastructure/pdf-runtime", () => ({
  loadPdf: (bytes: Uint8Array) => {
    renderer.load(bytes);
    return {
      destroy: renderer.destroy,
      promise: Promise.resolve({
        numPages: bytes[0] === 2 ? 2 : 3,
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

test("通常2ページの履歴書には続紙警告を表示せず、超過PDFには表示する", async () => {
  const { rerender } = render(
    <PdfPreview key="normal" bytes={new Uint8Array([2])} standardPages={2} />,
  );
  await waitFor(() => expect(screen.getByLabelText("ページ番号")).toHaveTextContent("1 / 2"));
  expect(screen.queryByText(/続紙を含む/)).not.toBeInTheDocument();
  rerender(<PdfPreview key="overflow" bytes={new Uint8Array([3])} standardPages={2} />);
  expect(await screen.findByText(/続紙を含む3ページ/)).toBeVisible();
});

test("入力をIPCで生成し、結果IDから読込・ページ移動・拡大を行う", async () => {
  const user = userEvent.setup();
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown> | undefined;
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
  expect(screen.queryByText(/続紙を含む/)).not.toBeInTheDocument();
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
