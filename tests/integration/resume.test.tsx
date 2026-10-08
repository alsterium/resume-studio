import { expandSections } from "../ui-navigation";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test, vi } from "vitest";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";
import { validateProject } from "../../src/domain/validate-project";
import type { Project } from "../../src/domain/project";
import fixture from "../fixtures/project-full.json";

test(
  "履歴書の全項目・行順・本文書式を編集保存し、再読込と新規でエディタを復元する",
  { timeout: 15000 },
  async () => {
    let saved: Project | undefined;
    mockIPC((command, args) => {
      if (command === "open_project")
        return { project: saved, fileId: "1", displayName: "履歴書.json" };
      expect(command).toBe("save_project");
      if (!args || Array.isArray(args) || args instanceof ArrayBuffer || args instanceof Uint8Array)
        throw new Error("save arguments required");
      saved = structuredClone(validateProject(args.project));
      return { fileId: "1", displayName: "履歴書.json" };
    });
    const user = userEvent.setup();
    render(<DraftWorkspace client={tauriClient} />);
    await expandSections(user);
    for (const [label, value] of [
      ["氏名", "架空 太郎"],
      ["氏名ふりがな", "かくう たろう"],
      ["プロジェクト名", "応募用"],
      ["現住所・郵便番号", "100-0000"],
      ["現住所・住所", "東京都架空区1-2"],
      ["現住所・住所ふりがな", "とうきょうと かくうく"],
      ["現住所・電話番号", "090-0000-0000"],
      ["現住所・メールアドレス", "fiction@example.invalid"],
      ["性別表示（任意）", "任意表示"],
    ]) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), value);
    }
    fireEvent.change(screen.getByLabelText("書類日付"), { target: { value: "2025-03-01" } });
    fireEvent.change(screen.getByLabelText("生年月日"), { target: { value: "2000-02-29" } });
    expect(screen.getByLabelText("満年齢")).toHaveTextContent("満25歳");
    await user.click(screen.getByLabelText("別連絡先を入力"));
    for (const field of ["郵便番号", "住所", "住所ふりがな", "電話番号", "メールアドレス"]) {
      await user.type(screen.getByLabelText(`別連絡先・${field}`), `別${field}`);
    }
    for (const title of ["学歴", "職歴", "免許・資格"]) {
      await user.click(screen.getByRole("button", { name: `${title}を追加` }));
      await user.type(screen.getByLabelText(`${title} 1 内容`), `${title}前`);
      fireEvent.change(screen.getByLabelText(`${title} 1 年月`), { target: { value: "2020-04" } });
      await user.click(screen.getByRole("button", { name: `${title}を追加` }));
      await user.type(screen.getByLabelText(`${title} 2 内容`), `${title}後`);
      await user.click(screen.getByRole("button", { name: `${title} 2 上へ` }));
      expect(screen.getByLabelText(`${title} 1 内容`)).toHaveValue(`${title}後`);
      await user.click(screen.getByRole("button", { name: `${title} 1 下へ` }));
      await user.click(screen.getByRole("button", { name: `${title}を追加` }));
      await user.click(screen.getByRole("button", { name: `${title} 3 削除` }));
      expect(screen.queryByLabelText(`${title} 3 内容`)).toBeNull();
    }
    const motivation = "志望動機・特技・アピールポイント";
    await user.click(
      within(screen.getByLabelText(`${motivation}の書式`)).getByRole("button", { name: "太字" }),
    );
    await user.type(screen.getByLabelText(motivation), "志望動機末尾");
    await user.type(screen.getByLabelText("本人希望欄"), "希望末尾");
    expect(screen.getByLabelText("保存状態")).toHaveTextContent("未保存");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(saved?.profile).toMatchObject({
      name: "架空 太郎",
      nameKana: "かくう たろう",
      genderLabel: "任意表示",
      addressKana: "とうきょうと かくうく",
      birthDate: "2000-02-29",
      alternateContact: { addressKana: "別住所ふりがな" },
    });
    expect(saved?.documentDate).toBe("2025-03-01");
    for (const key of ["education", "employment", "qualifications"] as const) {
      expect(saved?.resume[key]).toHaveLength(2);
      expect(saved?.resume[key][0].yearMonth).toBe("2020-04");
      expect(saved?.resume[key][1].yearMonth).toBe("");
      expect(saved?.resume[key][0].id).not.toBe(saved?.resume[key][1].id);
    }
    expect(JSON.stringify(saved?.resume.motivation)).toContain('"bold"');
    await user.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByLabelText(motivation).querySelector("strong")).toHaveTextContent(
      "志望動機末尾",
    );
    expect(screen.getByLabelText("本人希望欄")).toHaveTextContent("希望末尾");
    expect(screen.getByLabelText("別連絡先・住所ふりがな")).toHaveValue("別住所ふりがな");
    expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
    await user.click(screen.getByRole("button", { name: "新規" }));
    expect(screen.getByLabelText(motivation)).toHaveTextContent("");
    expect(screen.getByLabelText("本人希望欄")).toHaveTextContent("");
    expect(screen.queryByLabelText("学歴 1 内容")).toBeNull();
    expect(screen.getByLabelText("別連絡先を入力")).not.toBeChecked();
  },
);

test("任意項目を省略して保存でき、履歴書の編集も未保存確認で保護する", async () => {
  const original = validateProject(structuredClone(fixture));
  let saved: Project | undefined;
  mockIPC((command, args) => {
    if (command === "open_project")
      return { project: original, fileId: "1", displayName: "全項目.json" };
    expect(command).toBe("save_project");
    if (!args || Array.isArray(args) || args instanceof ArrayBuffer || args instanceof Uint8Array)
      throw new Error("save arguments required");
    saved = validateProject(args.project);
    return { fileId: "1", displayName: "全項目.json" };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await expandSections(user);
  await user.click(screen.getByRole("button", { name: "開く" }));
  await user.clear(screen.getByLabelText("性別表示（任意）"));
  await user.click(screen.getByLabelText("別連絡先を入力"));
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(screen.getByLabelText("氏名ふりがな")).toBeDisabled();
  expect(screen.getByLabelText("本人希望欄")).toHaveAttribute("contenteditable", "false");
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(screen.getByLabelText("氏名ふりがな")).toHaveValue(original.profile.nameKana);
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(saved?.profile).not.toHaveProperty("genderLabel");
  expect(saved?.profile).not.toHaveProperty("alternateContact");
  expect(saved?.career).toEqual(original.career);
  expect(saved?.assets).toEqual(original.assets);
  fireEvent.change(screen.getByLabelText("生年月日"), { target: { value: "9999-01-01" } });
  expect(screen.getByLabelText("満年齢")).toHaveTextContent("未算出");
  expect(screen.getByRole("alert")).toHaveTextContent("書類日付以前");
});

test("上限200行で追加を止め、先頭・末尾の移動を無効にする", async () => {
  const project = validateProject(structuredClone(fixture));
  project.resume.education = Array.from({ length: 200 }, (_, index) => ({
    id: `edu-${index}`,
    text: `学校${index}`,
    yearMonth: "",
  }));
  mockIPC(() => ({ project, fileId: "1", displayName: "200行.json" }));
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} />);
  await expandSections(user);
  await user.click(screen.getByRole("button", { name: "開く" }));
  expect(screen.getByRole("button", { name: "学歴を追加" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "学歴 1 上へ" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "学歴 200 下へ" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "学歴 200 削除" }));
  expect(screen.getByRole("button", { name: "学歴を追加" })).toBeEnabled();
});

test("今日の日付設定を保存復元し、日付変更時の表示と年齢を更新して指定日へ戻せる", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 0, 1, 12));
  let saved: Project | undefined;
  mockIPC((command, raw) => {
    if (command === "open_project")
      return { project: saved, fileId: "date", displayName: "日付.json" };
    if (command === "save_project") {
      saved = structuredClone(validateProject((raw as { project: unknown }).project));
      return { fileId: "date", displayName: "日付.json" };
    }
    throw new Error(command);
  });
  const user = userEvent.setup();
  const view = render(<DraftWorkspace client={tauriClient} />);
  try {
    fireEvent.change(screen.getByLabelText("書類日付"), { target: { value: "2020-04-01" } });
    fireEvent.change(screen.getByLabelText("生年月日"), { target: { value: "2000-01-02" } });
    await user.selectOptions(screen.getByLabelText("書類日付の設定"), "today");
    expect(screen.getByLabelText("書類日付")).toBeDisabled();
    expect(screen.getByLabelText("書類日付")).toHaveValue("2027-01-01");
    expect(screen.getByLabelText("満年齢")).toHaveTextContent("満26歳");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(saved?.documentDateMode).toBe("today");
    expect(saved?.documentDate).toBe("2020-04-01");
    vi.setSystemTime(new Date(2027, 0, 2, 12));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.getByLabelText("書類日付")).toHaveValue("2027-01-02"));
    expect(screen.getByLabelText("満年齢")).toHaveTextContent("満27歳");
    expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
    await user.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByLabelText("書類日付の設定")).toHaveValue("today");
    expect(screen.getByLabelText("書類日付")).toHaveValue("2027-01-02");
    await user.click(screen.getByRole("tab", { name: "職務経歴書" }));
    expect(screen.getByLabelText("書類日付の設定")).toHaveValue("today");
    await user.selectOptions(screen.getByLabelText("書類日付の設定"), "fixed");
    expect(screen.getByLabelText("書類日付")).toBeEnabled();
    expect(screen.getByLabelText("書類日付")).toHaveValue("2020-04-01");
    fireEvent.change(screen.getByLabelText("書類日付"), { target: { value: "" } });
    await user.selectOptions(screen.getByLabelText("書類日付の設定"), "today");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(saved?.documentDateMode).toBe("today");
    expect(saved?.documentDate).toBe("2027-01-02");
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
