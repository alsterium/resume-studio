import { IDBFactory } from "fake-indexeddb";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { WebApp, WebWorkspace } from "../../src/WebApp";
import {
  createDraftStore,
  readProjectFile,
  projectJson,
  type DraftStore,
} from "../../src/infrastructure/browser-projects";
import { beginSession, editSession } from "../../src/domain/session";
import { validateProject } from "../../src/domain/validate-project";
import { newProject } from "../../src/domain/new-project";
import fixture from "../fixtures/project-full.json";

function projectFile(value: unknown, name = "応募書類.json") {
  const json = JSON.stringify(value);
  const file = new File([json], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => json });
  return file;
}
const exported: Blob[] = [];
let click: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  exported.length = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      exported.push(blob);
      return "blob:project";
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  delete (URL as Partial<typeof URL>).createObjectURL;
  delete (URL as Partial<typeof URL>).revokeObjectURL;
});
function textOf(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

test("Macの全項目JSONをWebで編集・別名保存して再読込し、本文・写真・テンプレート・未編集欄を保持する", async () => {
  const store = createDraftStore(new IDBFactory());
  const user = userEvent.setup();
  render(<WebApp draftStore={store} />);
  await screen.findByLabelText("氏名");
  await user.upload(screen.getByLabelText("プロジェクトJSONを選択"), projectFile(fixture));
  await waitFor(() => expect(screen.getByLabelText("氏名")).toHaveValue(fixture.profile.name));
  await user.clear(screen.getByLabelText("氏名"));
  await user.type(screen.getByLabelText("氏名"), "架空 Web編集");
  await waitFor(() =>
    expect(screen.getByLabelText("下書き保存状態")).toHaveTextContent("下書き保存済み"),
  );
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存変更あり");
  await user.click(screen.getByRole("button", { name: "別名保存" }));
  await user.clear(screen.getByLabelText("ファイル名"));
  await user.type(screen.getByLabelText("ファイル名"), "スマホ編集");
  await user.click(screen.getByRole("button", { name: "ダウンロード" }));
  expect(click).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("プロジェクトファイル")).toHaveTextContent("スマホ編集.json");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存変更なし");
  const json = await textOf(exported[0]);
  const reloaded = await readProjectFile(projectFile(JSON.parse(json)));
  expect(reloaded).toEqual({
    ...validateProject(structuredClone(fixture)),
    profile: { ...fixture.profile, name: "架空 Web編集" },
  });
  await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
  const preview = screen.getByLabelText("簡易書類プレビュー");
  expect(within(preview).getByText(fixture.career.positions[0].companyName)).toBeInTheDocument();
  expect(preview.querySelector("strong")).toBeInTheDocument();
  expect(preview.querySelector("em")).toBeInTheDocument();
  expect(preview.querySelector("ol")).toHaveAttribute("start", "2");
  expect((await store.read())?.session.project).toEqual(reloaded);
});

test("IndexedDBの下書きを再起動で復元し、JSON未保存状態と写真を保持する", async () => {
  const factory = new IDBFactory();
  const store = createDraftStore(factory);
  const project = validateProject(structuredClone(fixture));
  const session = editSession(beginSession(project), {
    ...project,
    profile: { ...project.profile, name: "復元する架空名" },
  });
  await store.write({ session, filename: "元データ.json" });
  const freshStore = createDraftStore(factory);
  render(<WebApp draftStore={freshStore} />);
  expect(await screen.findByLabelText("氏名")).toHaveValue("復元する架空名");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存変更あり");
  expect(screen.getByAltText("取り込んだ証明写真")).toHaveAttribute(
    "src",
    `data:${project.assets[0].mediaType};base64,${project.assets[0].base64}`,
  );
});

test("読込失敗・ダウンロード失敗・下書き容量不足でも入力を保持し、再試行できる", async () => {
  const project = newProject();
  const store: DraftStore = {
    read: async () => null,
    write: vi.fn().mockRejectedValue(new Error("容量不足")),
  };
  const user = userEvent.setup();
  render(
    <WebWorkspace
      store={store}
      initial={{ session: beginSession(project), filename: "応募.json" }}
    />,
  );
  await user.type(screen.getByLabelText("氏名"), "残す架空名");
  await waitFor(() =>
    expect(screen.getByLabelText("下書き保存状態")).toHaveTextContent("容量不足"),
  );
  await user.click(screen.getByRole("button", { name: "開く" }));
  await user.click(screen.getByRole("button", { name: "保存せず続行" }));
  await user.upload(
    screen.getByLabelText("プロジェクトJSONを選択"),
    projectFile({ ...fixture, schemaVersion: 2 }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("構造または版");
  expect(screen.getByLabelText("氏名")).toHaveValue("残す架空名");
  click.mockImplementationOnce(() => {
    throw new Error("ダウンロード失敗");
  });
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByRole("alert")).toHaveTextContent("ダウンロード失敗");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存変更あり");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存変更なし");
  expect(screen.getByLabelText("氏名")).toHaveValue("残す架空名");
});

test("復元できない下書きを起動直後に上書きせず、明示的な新規操作で保存を再開する", async () => {
  const store: DraftStore = {
    read: vi.fn().mockRejectedValue(new Error("復元できません")),
    write: vi.fn().mockResolvedValue(undefined),
  };
  const user = userEvent.setup();
  render(<WebApp draftStore={store} />);
  await screen.findByLabelText("氏名");
  expect(store.write).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("既存の下書きは変更していません");
  await user.click(screen.getByRole("button", { name: "新規" }));
  await waitFor(() => expect(store.write).toHaveBeenCalledOnce());
});

test("表示切替と書類往復で入力を保ち、IME中の保存キーを抑止する", async () => {
  const user = userEvent.setup();
  const store = createDraftStore(new IDBFactory());
  render(<WebApp draftStore={store} />);
  const input = await screen.findByLabelText("氏名");
  await user.type(input, "切替の架空名");
  await user.click(screen.getByRole("button", { name: "プレビュー" }));
  await user.selectOptions(screen.getByLabelText("プレビューする書類"), "職務経歴書");
  await user.click(screen.getByRole("button", { name: "編集" }));
  expect(input).toHaveValue("切替の架空名");
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "s", metaKey: true });
  fireEvent.compositionEnd(input);
  expect(click).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "s", ctrlKey: true });
  expect(click).toHaveBeenCalledOnce();
  await user.type(input, "未保存");
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(input).toHaveValue("切替の架空名未保存");
});

test("複数の下書き保存を順に完了し、不正な入力で最後の正常データを置換しない", async () => {
  const store = createDraftStore(new IDBFactory());
  const session = beginSession(newProject());
  const first = { session, filename: "初期.json" };
  const next = { ...first, session: editSession(session, { ...session.project, title: "最新" }) };
  await Promise.all([store.write(first), store.write(next)]);
  expect(await store.read()).toEqual(next);
  expect(() =>
    store.write({
      ...next,
      session: {
        ...next.session,
        project: { ...next.session.project, documentDate: "2026-02-30" },
      },
    }),
  ).toThrow("書類日付");
  expect(await store.read()).toEqual(next);
  const oversized = projectFile({ ...fixture, title: "a".repeat(21 * 1024 * 1024) });
  await expect(readProjectFile(oversized)).rejects.toThrow("20MiB");
  expect(projectJson(validateProject(structuredClone(fixture)))).toContain('"schemaVersion": 1');
});

test("非同期の下書き完了を待つ間も編集可能で、古い完了を最新の保存済みと表示しない", async () => {
  const releases: (() => void)[] = [];
  const store: DraftStore = {
    read: async () => null,
    write: () =>
      new Promise((resolve) => {
        releases.push(resolve);
      }),
  };
  render(
    <WebWorkspace
      store={store}
      initial={{ session: beginSession(newProject()), filename: "応募.json" }}
    />,
  );
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("氏名"), { target: { value: "追加入力" } });
  await act(async () => {});
  await act(async () => releases[0]());
  expect(screen.getByLabelText("下書き保存状態")).toHaveTextContent("保存中");
  await act(async () => releases[1]());
  expect(screen.getByLabelText("下書き保存状態")).toHaveTextContent("下書き保存済み");
});
