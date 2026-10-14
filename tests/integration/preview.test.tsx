import { openSummary, projectMenu } from "../ui-navigation";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Channel } from "@tauri-apps/api/core";
import type { GeneratedDocument, JobPhase } from "../../src/infrastructure/app-client";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test, vi } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { PdfPreview } from "../../src/features/preview/PdfPreview";
import { tauriClient } from "../../src/infrastructure/app-client";
import fullProject from "../fixtures/project-full.json";

async function setZoom(user: ReturnType<typeof userEvent.setup>, target: number) {
  for (let step = 0; step < 8; step++) {
    const current = Number(screen.getByLabelText("表示倍率").textContent?.replace("%", "")) / 100;
    if (current === target) return;
    await user.click(screen.getByRole("button", { name: current > target ? "縮小" : "拡大" }));
  }
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent(String(target * 100) + "%");
}

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

test.each(["1.0.0", "1.1.0"])(
  "削除した版%sを読み込み、残る版へ明示変更して生成する",
  async (version) => {
    const user = userEvent.setup();
    let fail = false;
    let generated = false;
    const project = structuredClone(fullProject);
    project.templates.resume.version = version;
    mockIPC((command, rawArgs) => {
      const args = rawArgs as Record<string, unknown> | undefined;
      if (command === "open_project") return { project, fileId: "file", displayName: "架空.json" };
      if (command === "list_templates")
        return [
          {
            id: "resume-standard",
            version: "1.3.0",
            displayName: "履歴書(動的レイアウト)",
            documentKind: "resume",
            schemaVersions: [1],
            engine: "lualatex",
            packages: [],
            fonts: [],
          },
          {
            id: "resume-standard",
            version: "1.2.0",
            displayName: "履歴書(JIS形式)",
            documentKind: "resume",
            schemaVersions: [1],
            engine: "lualatex",
            packages: [],
            fonts: [],
          },
          {
            id: "career-standard",
            version: "1.2.0",
            displayName: "職務経歴書",
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
                resume: { id: "resume-standard", version: "1.2.0" },
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
    expect(
      screen.getByRole("option", { name: "履歴書(動的レイアウト) 1.3.0" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "開く" }));
    await screen.findByDisplayValue("架空 山田");
    await user.click(screen.getByRole("button", { name: "テンプレート一覧を確認" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "履歴書の指定版は同梱されていません",
    );
    expect(screen.getByLabelText("履歴書テンプレート")).toHaveValue(
      JSON.stringify(["resume-standard", version]),
    );
    expect(screen.getByRole("option", { name: "履歴書(JIS形式) 1.2.0" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "履歴書(動的レイアウト) 1.3.0" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
    await user.selectOptions(
      screen.getByLabelText("履歴書テンプレート"),
      JSON.stringify(["resume-standard", "1.2.0"]),
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
  },
);

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
          if (page < 1 || page > (bytes[0] === 2 ? 2 : 3)) throw new Error("Invalid PDF page");
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
  await openSummary(user);
  await user.type(screen.getByLabelText("本文"), "日本語 & %");
  await projectMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "職務要約の下書きPDF更新" }));
  expect(await screen.findByLabelText("ページ番号")).toHaveTextContent("1 / 3");
  expect(screen.queryByText(/続紙を含む/)).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("data-rendered-page", "1"),
  );
  await user.click(screen.getByRole("button", { name: "見開き" }));
  expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "次のページ" }));
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("data-rendered-page", "2"),
  );
  await setZoom(user, 1.5);
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
  await projectMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "職務要約の下書きPDF更新" }));
  const canvas = await screen.findByLabelText("生成されたPDFページ");
  await user.type(screen.getByLabelText("氏名"), "更新した名前");
  expect(screen.getByText("PDFは更新前の内容です。")).toBeVisible();
  fail = true;
  await projectMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "職務要約の下書きPDF更新" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("TeX生成に失敗");
  expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
  expect(screen.getByRole("button", { name: "履歴書PDF更新" })).toBeEnabled();
});

test("現在の書類・両書類をPDFとTeXで書き出し、部分成功とスキップとキャンセルを表示する", async () => {
  const user = userEvent.setup();
  let mode: "saved" | "partial" | "skipped" | "cancelled" | "failed" = "saved";
  const requests: { kinds: string[]; format: string }[] = [];
  let complete: ((value: unknown) => void) | undefined;
  let defer = false;
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown>;
    if (command === "generate_document")
      return {
        resultId: "previous-success",
        jobId: args.jobId,
        kind: args.kind,
        revision: args.revision,
        projectId: (args.project as typeof fullProject).projectId,
      };
    if (command === "read_pdf") return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    if (command !== "export_documents") throw new Error(command);
    const kinds = args.kinds as string[];
    requests.push({ kinds, format: args.format as string });
    (args.progress as Channel<JobPhase>).onmessage("generating");
    if (defer)
      return new Promise((resolve) => {
        complete = resolve;
      });
    if (mode === "cancelled") return null;
    if (mode === "failed") throw "保存先を確認できませんでした";
    return kinds.map((kind, index) => ({
      kind,
      displayName: `${kind}.${args.format}`,
      status:
        mode === "partial" && index === 1 ? "failed" : mode === "skipped" ? "skipped" : "saved",
      error: mode === "partial" && index === 1 ? "職務経歴書の保存失敗" : null,
    }));
  });
  const { rerender } = render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  let previousCanvas = await screen.findByLabelText("生成されたPDFページ");
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".lucide-check"),
  ).toBeInTheDocument();
  expect(screen.queryByText("書き出し結果を確認してください。")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("書き出し結果")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "書き出し" })).toHaveFocus();
  expect(requests.at(-1)).toEqual({ kinds: ["resume"], format: "pdf" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  rerender(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  expect(requests.at(-1)).toEqual({ kinds: ["career"], format: "pdf" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  rerender(<DraftWorkspace client={tauriClient} document="履歴書" />);
  await user.click(screen.getByRole("button", { name: "書き出し" }));
  previousCanvas = await screen.findByLabelText("生成されたPDFページ");
  await user.selectOptions(screen.getByLabelText("出力対象"), "both");
  await user.selectOptions(screen.getByLabelText("出力形式"), "tex");
  mode = "partial";
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  expect(await screen.findByLabelText("書き出し結果")).toHaveTextContent(
    "resume.tex：保存しました",
  );
  expect(screen.getByLabelText("書き出し結果")).toHaveTextContent("career.tex：保存に失敗しました");
  expect(screen.getByLabelText("書き出し結果")).toHaveTextContent("職務経歴書の保存失敗");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".lucide-check"),
  ).not.toBeInTheDocument();
  expect(requests.at(-1)).toEqual({ kinds: ["resume", "career"], format: "tex" });
  mode = "skipped";
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  expect(await screen.findByLabelText("書き出し結果")).toHaveTextContent("スキップしました");
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".lucide-check"),
  ).not.toBeInTheDocument();
  mode = "cancelled";
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  expect(await screen.findByLabelText("書き出し状態")).toHaveTextContent("キャンセルしました");
  expect(screen.queryByLabelText("書き出し結果")).not.toBeInTheDocument();
  mode = "failed";
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存先を確認できませんでした");
  expect(screen.getByLabelText("生成されたPDFページ")).toBe(previousCanvas);
  defer = true;
  if (!screen.queryByRole("dialog"))
    await user.click(screen.getByRole("button", { name: "書き出し" }));
  await user.click(screen.getByRole("button", { name: "書き出す" }));
  expect(screen.getByRole("button", { name: "書き出す" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "書き出す" })).toHaveAttribute("aria-busy", "true");
  expect(
    screen.getByRole("button", { name: "書き出す" }).querySelector(".animate-spin"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新規", hidden: true })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "閉じる" }));
  expect(screen.getByRole("button", { name: "書き出し" })).toHaveAttribute("aria-busy", "true");
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".animate-spin"),
  ).toBeInTheDocument();
  await user.type(screen.getByLabelText("氏名"), "追加編集");
  vi.useFakeTimers();
  await act(async () => {
    complete?.([{ kind: "resume", status: "saved", displayName: "履歴書-tex", error: null }]);
  });
  expect(screen.getByLabelText("書き出し状態")).toHaveTextContent(
    "書き出し中の編集は含まれていません",
  );
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".lucide-check"),
  ).toBeInTheDocument();
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
  } finally {
    vi.useRealTimers();
  }
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".lucide-check"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "書き出し" }).querySelector(".lucide-download"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "書き出し" }));
  expect(screen.getByRole("button", { name: "書き出す" })).toBeEnabled();
});

test("TeX未検出・時間切れ・コンパイル失敗の対処とログを表示し、成功PDFを保持して再実行できる", async () => {
  const user = userEvent.setup();
  let failure: string | null = null;
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown>;
    if (command === "generate_document") {
      if (failure) throw failure;
      return {
        resultId: "last-success",
        jobId: args.jobId,
        kind: args.kind,
        revision: args.revision,
        projectId: (args.project as typeof fullProject).projectId,
      };
    }
    if (command === "read_pdf") return new Uint8Array([37, 80, 68, 70, 45]).buffer;
    throw new Error(command);
  });
  render(<DraftWorkspace client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  const canvas = await screen.findByLabelText("生成されたPDFページ");
  for (const [code, hint] of [
    ["TEX_NOT_FOUND", "TeX一式"],
    ["TIMEOUT", "時間内"],
    ["COMPILE_FAILED", "生成ログ"],
  ]) {
    failure = `生成失敗 (${code})\n! 架空 failure log`;
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(hint);
    expect(screen.getByLabelText("生成されたPDFページ")).toBe(canvas);
    expect(screen.getByRole("button", { name: "履歴書PDF更新" })).toBeEnabled();
    await user.click(screen.getByText("生成ログを表示"));
    expect(screen.getByText("! 架空 failure log")).toBeVisible();
  }
  failure = null;
  await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
  await screen.findByLabelText("生成されたPDFページ");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("見開きは2ページを描画し、奇数の最終ページから戻り倍率を変更できる", async () => {
  const user = userEvent.setup();
  render(<PdfPreview bytes={new Uint8Array([3])} fitToWidth />);
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ 2")).toHaveAttribute(
      "data-rendered-page",
      "2",
    ),
  );
  expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "次のページ" }));
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("data-rendered-page", "3"),
  );
  expect(screen.queryByLabelText("生成されたPDFページ 4")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "前のページ" }));
  await user.click(screen.getByRole("button", { name: "見開き" }));
  expect(screen.queryByLabelText("生成されたPDFページ 2")).not.toBeInTheDocument();
  await setZoom(user, 1.5);
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute(
      "data-rendered-scale",
      "1.5",
    ),
  );
  await user.click(screen.getByRole("button", { name: "次のページ" }));
  await waitFor(() =>
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("data-rendered-page", "2"),
  );
});

test("手動・自動の再生成と書類切替でも書類ごとの見開き・倍率設定を保持する", async () => {
  const user = userEvent.setup();
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown>;
    if (command === "generate_document")
      return {
        resultId: args.jobId,
        jobId: args.jobId,
        projectId: (args.project as typeof fullProject).projectId,
        kind: args.kind,
        revision: args.revision,
      };
    if (command === "read_pdf") return new Uint8Array([2]).buffer;
    throw new Error(command);
  });
  const view = render(<DraftWorkspace client={tauriClient} />);
  const rendered = async () => {
    await waitFor(() =>
      expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute(
        "data-rendered-page",
        "1",
      ),
    );
  };
  const regenerated = async (previous: HTMLElement) => {
    await waitFor(() => expect(screen.getByLabelText("生成されたPDFページ")).not.toBe(previous), {
      timeout: 5000,
    });
    await rendered();
  };
  try {
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await rendered();
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "見開き" }));
    await setZoom(user, 1.5);
    let previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await regenerated(previous);
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("生成されたPDFページ 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("表示倍率")).toHaveTextContent("150%");
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("width", "900");
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    await user.click(screen.getByRole("button", { name: "職務経歴書PDF更新" }));
    await rendered();
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "画面に合わせる" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await setZoom(user, 0.75);
    await user.click(screen.getByRole("button", { name: "見開き" }));
    await user.click(screen.getByRole("tab", { name: "履歴書" }));
    await rendered();
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("表示倍率")).toHaveTextContent("150%");
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("checkbox", { name: "PDFを自動生成する" }));
    await user.keyboard("{Escape}");
    await regenerated(previous);
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.type(screen.getByLabelText("氏名"), "架空の自動再生成");
    await regenerated(previous);
    expect(screen.getByLabelText("表示倍率")).toHaveTextContent("150%");
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("width", "900");
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("生成されたPDFページ 2")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "見開き" }));
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await regenerated(previous);
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("生成されたPDFページ 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "画面に合わせる" }));
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await regenerated(previous);
    expect(screen.getByRole("button", { name: "画面に合わせる" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    await rendered();
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("表示倍率")).toHaveTextContent("75%");
    expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute("width", "450");
  } finally {
    view.unmount();
    localStorage.removeItem("resume-studio.auto-pdf");
  }
});

test("PDF再生成と書類切替で表示ページを保持し、ページ数減少時は最終ページへ補正する", async () => {
  const user = userEvent.setup();
  let pages = 3;
  mockIPC((command, rawArgs) => {
    const args = rawArgs as Record<string, unknown>;
    if (command === "generate_document")
      return {
        resultId: args.jobId,
        jobId: args.jobId,
        projectId: (args.project as typeof fullProject).projectId,
        kind: args.kind,
        revision: args.revision,
      };
    if (command === "read_pdf") return new Uint8Array([pages]).buffer;
    throw new Error(command);
  });
  const view = render(<DraftWorkspace client={tauriClient} />);
  const displayed = async (page: number, count = pages) => {
    await waitFor(() => {
      expect(screen.getByLabelText("ページ番号")).toHaveTextContent(`${page} / ${count}`);
      expect(screen.getByLabelText("生成されたPDFページ")).toHaveAttribute(
        "data-rendered-page",
        String(page),
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  };
  const regenerated = async (previous: HTMLElement, page: number) => {
    await waitFor(() => expect(screen.getByLabelText("生成されたPDFページ")).not.toBe(previous), {
      timeout: 5000,
    });
    await displayed(page);
  };
  try {
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await displayed(1);
    await user.click(screen.getByRole("button", { name: "見開き" }));
    await user.click(screen.getByRole("button", { name: "次のページ" }));
    await displayed(2);
    await setZoom(user, 1.5);
    let previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "履歴書PDF更新" }));
    await regenerated(previous, 2);
    expect(screen.getByRole("button", { name: "見開き" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("表示倍率")).toHaveTextContent("150%");
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    await user.click(screen.getByRole("button", { name: "職務経歴書PDF更新" }));
    await displayed(1);
    await user.click(screen.getByRole("button", { name: "次のページ" }));
    await displayed(3);
    await user.click(screen.getByRole("tab", { name: "履歴書" }));
    await displayed(2);
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("checkbox", { name: "PDFを自動生成する" }));
    await user.keyboard("{Escape}");
    await regenerated(previous, 2);
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.type(screen.getByLabelText("氏名"), "架空のページ保持");
    await regenerated(previous, 2);
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    await displayed(3);
    // 自動更新がある場合も同じページを表示する。
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "職務経歴書PDF更新" })).toBeEnabled(),
    );
    pages = 2;
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "職務経歴書PDF更新" }));
    await regenerated(previous, 2);
    await user.click(screen.getByRole("tab", { name: "履歴書" }));
    await displayed(2, 3);
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    await displayed(2);
    pages = 3;
    previous = screen.getByLabelText("生成されたPDFページ");
    await user.click(screen.getByRole("button", { name: "職務経歴書PDF更新" }));
    await regenerated(previous, 2);
  } finally {
    view.unmount();
    localStorage.removeItem("resume-studio.auto-pdf");
  }
});

test("右下のズーム操作は境界・幅合わせ・キーボード操作に対応する", async () => {
  const user = userEvent.setup();
  render(<PdfPreview bytes={new Uint8Array([2])} />);
  await waitFor(() => expect(screen.getByLabelText("ページ番号")).toHaveTextContent("1 / 2"));
  const group = screen.getByRole("group", { name: "プレビューのズーム操作" });
  expect(group).toHaveAttribute("data-slot", "button-group");
  expect(group.parentElement).toHaveClass("preview-viewport");
  expect(group.parentElement?.querySelector(".pdf-paper")).toBeInTheDocument();
  expect(screen.queryByText("ピンチで拡大・縮小")).not.toBeInTheDocument();
  await setZoom(user, 2);
  expect(screen.getByRole("button", { name: "拡大" })).toBeDisabled();
  await setZoom(user, 0.25);
  expect(screen.getByRole("button", { name: "縮小" })).toBeDisabled();
  screen.getByRole("button", { name: "拡大" }).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent("50%");
  const paper = group.parentElement!.querySelector(".pdf-paper")!;
  Object.defineProperty(paper, "clientWidth", { configurable: true, value: 648 });
  await user.click(screen.getByRole("button", { name: "画面に合わせる" }));
  await waitFor(() => expect(screen.getByLabelText("表示倍率")).toHaveTextContent("100%"));
  expect(screen.getByRole("button", { name: "画面に合わせる" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "拡大" }));
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent("125%");
  expect(screen.getByRole("button", { name: "画面に合わせる" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("ピンチはPDFだけを拡大し通常スクロールを妨げず、WebKitとwheelの重複を防ぐ", async () => {
  render(<PdfPreview bytes={new Uint8Array([2])} />);
  await waitFor(() => expect(screen.getByLabelText("ページ番号")).toHaveTextContent("1 / 2"));
  const canvas = screen.getByLabelText("生成されたPDFページ");
  const paper = canvas.closest(".pdf-paper")!;
  const gesture = (type: string, scale = 1) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { scale, clientX: 100, clientY: 100 });
    fireEvent(paper, event);
    return event;
  };
  const normal = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
  fireEvent(paper, normal);
  expect(normal.defaultPrevented).toBe(false);
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent("100%");
  gesture("gesturestart");
  expect(screen.getByRole("group", { name: "プレビューのズーム操作" })).toHaveAttribute(
    "data-pinching",
    "true",
  );
  gesture("gesturechange", 1.5);
  fireEvent.wheel(paper, { ctrlKey: true, deltaY: -20 });
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent("150%");
  gesture("gesturechange", 1.25); // Cumulative from start, not from the last change.
  await waitFor(() => expect(canvas).toHaveAttribute("data-rendered-scale", "1.25"));
  gesture("gestureend");
  expect(screen.getByRole("group", { name: "プレビューのズーム操作" })).toHaveAttribute(
    "data-pinching",
    "false",
  );
  const wheel = new WheelEvent("wheel", {
    ctrlKey: true,
    deltaY: -1000,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(paper, wheel);
  expect(screen.getByRole("group", { name: "プレビューのズーム操作" })).toHaveAttribute(
    "data-pinching",
    "true",
  );
  expect(wheel.defaultPrevented).toBe(true);
  await waitFor(() => expect(canvas).toHaveAttribute("data-rendered-scale", "2"));
  fireEvent.wheel(paper, { ctrlKey: true, deltaY: 1000 });
  await waitFor(() => expect(canvas).toHaveAttribute("data-rendered-scale", "0.25"));
  await waitFor(() =>
    expect(screen.getByRole("group", { name: "プレビューのズーム操作" })).toHaveAttribute(
      "data-pinching",
      "false",
    ),
  );
  gesture("gesturestart");
  gesture("gesturechange", Number.NaN);
  gesture("gestureend");
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent("25%");
});

test("2指タッチで拡大縮小し、指が離れた後の1指操作を維持する", async () => {
  render(<PdfPreview bytes={new Uint8Array([2])} />);
  await waitFor(() => expect(screen.getByLabelText("ページ番号")).toHaveTextContent("1 / 2"));
  const canvas = screen.getByLabelText("生成されたPDFページ");
  const paper = canvas.closest(".pdf-paper")!;
  const touches = (width: number) => [
    { clientX: 100, clientY: 100 },
    { clientX: 100 + width, clientY: 100 },
  ];
  fireEvent.touchStart(paper, { touches: touches(100) });
  expect(screen.getByRole("group", { name: "プレビューのズーム操作" })).toHaveAttribute(
    "data-pinching",
    "true",
  );
  fireEvent.touchMove(paper, { touches: touches(150) });
  await waitFor(() => expect(canvas).toHaveAttribute("data-rendered-scale", "1.5"));
  fireEvent.touchMove(paper, { touches: touches(50) });
  await waitFor(() => expect(canvas).toHaveAttribute("data-rendered-scale", "0.5"));
  fireEvent.touchCancel(paper);
  expect(screen.getByRole("group", { name: "プレビューのズーム操作" })).toHaveAttribute(
    "data-pinching",
    "false",
  );
  const single = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.assign(single, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent(paper, single);
  expect(single.defaultPrevented).toBe(false);
  expect(screen.getByLabelText("表示倍率")).toHaveTextContent("50%");
});
