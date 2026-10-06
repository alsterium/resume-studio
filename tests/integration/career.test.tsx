import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";
import { App } from "../../src/App";
import { DraftWorkspace } from "../../src/features/preview/DraftWorkspace";
import { tauriClient } from "../../src/infrastructure/app-client";
import { validateProject } from "../../src/domain/validate-project";
import type { Project } from "../../src/domain/project";
import fixture from "../fixtures/project-full.json";

function savedArgs(args: unknown): Project {
  if (!args || typeof args !== "object" || !("project" in args))
    throw new Error("save arguments required");
  return structuredClone(validateProject(args.project));
}

test("会社→案件・スキルの全項目を編集し、並べ替え・共通資格・保存再読込で値と書式を維持する", async () => {
  let saved: Project | undefined;
  mockIPC((command, args) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "open_project")
      return { project: saved, fileId: "1", displayName: "経歴.json" };
    expect(command).toBe("save_project");
    saved = savedArgs(args);
    return { fileId: "1", displayName: "経歴.json" };
  });
  const user = userEvent.setup();
  render(<App client={tauriClient} />);
  await user.click(screen.getByRole("button", { name: "職務経歴書" }));
  expect(screen.getByLabelText("職務経歴書の編集")).toBeVisible();
  expect(screen.getByLabelText("履歴書の編集")).not.toBeVisible();
  await user.type(screen.getByLabelText("本文"), "職務要約末尾");
  await user.click(screen.getByRole("button", { name: "会社を追加" }));
  for (const [label, value] of [
    ["会社名", "架空会社A"],
    ["役職・役割", "開発担当"],
    ["事業内容", "ソフトウェア開発"],
    ["資本金", "100万円"],
    ["従業員数", "10名"],
  ])
    await user.type(screen.getByLabelText(label), value);
  fireEvent.change(screen.getByLabelText("会社開始年月"), { target: { value: "2020-04" } });
  await user.click(screen.getByLabelText("在籍中"));
  fireEvent.change(screen.getByLabelText("会社終了年月"), { target: { value: "2022-03" } });
  await user.click(screen.getByRole("button", { name: "案件を追加" }));
  await user.type(screen.getByLabelText("案件名"), "架空案件A");
  fireEvent.change(screen.getByLabelText("案件開始年月"), { target: { value: "2020-05" } });
  await user.click(screen.getByLabelText("進行中"));
  fireEvent.change(screen.getByLabelText("案件終了年月"), { target: { value: "2021-03" } });
  await user.type(screen.getByLabelText("プロジェクト概要"), "概要末尾");
  await user.click(
    within(screen.getByLabelText("業務内容の書式")).getByRole("button", { name: "太字" }),
  );
  await user.type(screen.getByLabelText("業務内容"), "業務末尾");
  await user.type(screen.getByLabelText("実績・取り組み"), "実績末尾");
  await user.type(screen.getByLabelText("プロジェクト規模"), "5名チーム");
  await user.type(
    screen.getByLabelText("案件URL（任意）"),
    "https://example.invalid/project?q=1&x=2",
  );
  for (const title of ["担当フェーズ", "使用言語", "使用技術"]) {
    await user.click(screen.getByRole("button", { name: `${title}を追加` }));
    await user.type(screen.getByLabelText(`${title} 1`), `${title}A`);
    await user.click(screen.getByRole("button", { name: `${title}を追加` }));
    await user.type(screen.getByLabelText(`${title} 2`), `${title}B`);
    await user.click(screen.getByRole("button", { name: `${title} 2 削除` }));
  }
  await user.click(screen.getByRole("button", { name: "案件を追加" }));
  await user.type(screen.getByLabelText("案件名"), "架空案件B");
  await user.click(screen.getByRole("button", { name: "案件 上へ" }));
  await user.click(screen.getByRole("button", { name: "案件 下へ" }));
  const cases = screen.getByLabelText("編集する案件");
  const firstCaseId = (cases as HTMLSelectElement).options[0].value;
  await user.selectOptions(cases, firstCaseId);
  expect(screen.getByLabelText("業務内容").querySelector("strong")).toHaveTextContent("業務末尾");
  await user.click(screen.getByRole("button", { name: "案件を追加" }));
  await user.click(screen.getByRole("button", { name: "案件 削除" }));
  await user.click(screen.getByRole("button", { name: "会社を追加" }));
  await user.type(screen.getByLabelText("会社名"), "架空会社B");
  await user.click(screen.getByRole("button", { name: "会社 上へ" }));
  await user.click(screen.getByRole("button", { name: "会社 下へ" }));
  await user.click(screen.getByRole("button", { name: "会社を追加" }));
  await user.click(screen.getByRole("button", { name: "会社 削除" }));
  for (let index = 1; index <= 2; index++) {
    await user.click(screen.getByRole("button", { name: "スキルを追加" }));
    await user.type(screen.getByLabelText(`スキル ${index} スキル名`), `スキル${index}`);
    await user.type(screen.getByLabelText(`スキル ${index} 経験期間`), `${index}年`);
    await user.type(screen.getByLabelText(`スキル ${index} 説明`), `説明${index}`);
  }
  await user.click(screen.getByRole("button", { name: "スキル 2 上へ" }));
  await user.click(screen.getByRole("button", { name: "スキル 1 下へ" }));
  await user.click(screen.getByRole("button", { name: "スキルを追加" }));
  await user.click(screen.getByRole("button", { name: "スキル 3 削除" }));
  await user.type(screen.getByLabelText("自己PR"), "自己PR末尾");
  await user.click(screen.getByRole("button", { name: "免許・資格を追加" }));
  await user.type(screen.getByLabelText("免許・資格 1 内容"), "共通資格");
  await user.click(screen.getByRole("button", { name: "履歴書" }));
  expect(screen.getByLabelText("免許・資格 1 内容")).toHaveValue("共通資格");
  await user.click(screen.getByRole("button", { name: "職務経歴書" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(saved?.career.positions.map((value) => value.companyName)).toEqual([
    "架空会社A",
    "架空会社B",
  ]);
  const company = saved!.career.positions[0];
  expect(company).toMatchObject({
    role: "開発担当",
    startYearMonth: "2020-04",
    endYearMonth: "2022-03",
    companyOverview: { business: "ソフトウェア開発", capital: "100万円", employees: "10名" },
  });
  expect(saved!.career.positions[1].endYearMonth).toBeNull();
  expect(company.projects.map((value) => value.name)).toEqual(["架空案件A", "架空案件B"]);
  expect(company.projects[0]).toMatchObject({
    startYearMonth: "2020-05",
    endYearMonth: "2021-03",
    teamSize: "5名チーム",
    phases: ["担当フェーズA"],
    languages: ["使用言語A"],
    technologies: ["使用技術A"],
    url: "https://example.invalid/project?q=1&x=2",
  });
  expect(company.projects[0].id).toBe(firstCaseId);
  expect(JSON.stringify(company.projects[0].overview)).toContain("概要末尾");
  expect(JSON.stringify(company.projects[0].achievements)).toContain("実績末尾");
  expect(JSON.stringify(company.projects[0].responsibilities)).toContain('"bold"');
  expect(saved?.career.skills.map((value) => value.experienceLabel)).toEqual(["1年", "2年"]);
  expect(saved?.career.skills.map((value) => [value.name, value.description])).toEqual([
    ["スキル1", "説明1"],
    ["スキル2", "説明2"],
  ]);
  expect(saved?.resume.qualifications[0].text).toBe("共通資格");
  expect(JSON.stringify(saved?.career.summary)).toContain("職務要約末尾");
  expect(JSON.stringify(saved?.career.selfPromotion)).toContain("自己PR末尾");
  await user.selectOptions(screen.getByLabelText("編集する会社"), saved!.career.positions[1].id);
  expect(screen.getByLabelText("会社名")).toHaveValue("架空会社B");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
  await user.selectOptions(screen.getByLabelText("編集する会社"), company.id);
  expect(screen.getByLabelText("業務内容").querySelector("strong")).toHaveTextContent("業務末尾");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
  await user.click(screen.getByRole("button", { name: "開く" }));
  expect(screen.getByLabelText("会社名")).toHaveValue("架空会社A");
  expect(screen.getByLabelText("業務内容").querySelector("strong")).toHaveTextContent("業務末尾");
  expect(screen.getByLabelText("自己PR")).toHaveTextContent("自己PR末尾");
  expect(screen.getByLabelText("保存状態")).toHaveTextContent("保存済み");
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(screen.queryByLabelText("会社名")).toBeNull();
  expect(screen.getByLabelText("自己PR")).toHaveTextContent("");
}, 15000);

test("終了年月・URLの不正で保存を拒否し、修正・任意項目削除・未保存保護で回復する", async () => {
  const project = validateProject(structuredClone(fixture));
  let saves = 0;
  let saved: Project | undefined;
  mockIPC((command, args) => {
    if (command === "open_project") return { project, fileId: "1", displayName: "経歴.json" };
    expect(command).toBe("save_project");
    saves++;
    saved = savedArgs(args);
    return { fileId: "1", displayName: "経歴.json" };
  });
  const user = userEvent.setup();
  render(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  await user.click(screen.getByRole("button", { name: "開く" }));
  fireEvent.change(screen.getByLabelText("案件開始年月"), { target: { value: "2025-01" } });
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(saves).toBe(0);
  expect(
    screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("開始年月")),
  ).toBe(true);
  await user.click(screen.getByLabelText("進行中"));
  await user.clear(screen.getByLabelText("案件URL（任意）"));
  await user.type(screen.getByLabelText("案件URL（任意）"), "file:///tmp/test");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(saves).toBe(0);
  await user.clear(screen.getByLabelText("案件URL（任意）"));
  for (const label of ["事業内容", "資本金", "従業員数"])
    await user.clear(screen.getByLabelText(label));
  await user.click(screen.getByRole("button", { name: "新規" }));
  expect(screen.getByLabelText("会社名")).toBeDisabled();
  expect(screen.getByLabelText("業務内容")).toHaveAttribute("contenteditable", "false");
  expect(screen.getByLabelText("自己PR")).toHaveAttribute("contenteditable", "false");
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(saves).toBe(1);
  expect(saved?.career.positions[0]).not.toHaveProperty("companyOverview");
  expect(saved?.career.positions[0].projects[0]).not.toHaveProperty("url");
  expect(saved?.career.positions[0].projects[0].endYearMonth).toBeNull();
  expect(saved?.resume).toEqual(project.resume);
  expect(saved?.assets).toEqual(project.assets);
});

test("会社100・案件200・スキル200・一覧50の上限で追加を止め、削除後に再開できる", async () => {
  const project = validateProject(structuredClone(fixture));
  const source = project.career.positions[0];
  project.career.positions = Array.from({ length: 100 }, (_, index) => ({
    ...source,
    id: `company-${index}`,
    projects: index
      ? []
      : Array.from({ length: 200 }, (_, index) => ({
          ...source.projects[0],
          id: `case-${index}`,
          phases: Array.from({ length: 50 }, (_, index) => `phase-${index}`),
        })),
  }));
  project.career.skills = Array.from({ length: 200 }, (_, index) => ({
    id: `skill-${index}`,
    name: "技術",
    experienceLabel: "",
    description: "",
  }));
  mockIPC(() => ({ project, fileId: "1", displayName: "上限.json" }));
  render(<DraftWorkspace client={tauriClient} document="職務経歴書" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "開く" }));
  for (const name of [
    "会社を追加",
    "案件を追加",
    "スキルを追加",
    "担当フェーズを追加",
    "会社 上へ",
    "案件 上へ",
    "スキル 1 上へ",
    "スキル 200 下へ",
  ])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "担当フェーズ 50 削除" }));
  expect(screen.getByRole("button", { name: "担当フェーズを追加" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "案件 削除" }));
  expect(screen.getByRole("button", { name: "案件を追加" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "スキル 200 削除" }));
  expect(screen.getByRole("button", { name: "スキルを追加" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "会社 削除" }));
  expect(screen.getByRole("button", { name: "会社を追加" })).toBeEnabled();
}, 15_000);
