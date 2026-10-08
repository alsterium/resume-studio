import { expect, test } from "vitest";
import empty from "../fixtures/project-empty.json";
import full from "../fixtures/project-full.json";
import mutations from "../fixtures/project-invalid-cases.json";
import {
  MAX_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  validateProject,
} from "../../src/domain/validate-project";

test("空・全項目・本文書式・写真の共通fixtureを検証し、順序と値を維持する", () => {
  for (const fixture of [empty, full]) {
    const project = validateProject(structuredClone(fixture));
    expect(JSON.parse(JSON.stringify(project))).toEqual(fixture);
  }
});

test("共通異常系fixtureを構造・日付・本文・参照・期間の境界で拒否する", () => {
  for (const row of mutations) {
    const value = structuredClone(full);
    let target: Record<string | number, unknown> = value;
    for (const key of row.path.slice(0, -1)) target = target[key] as typeof target;
    const key = row.path.at(-1)!;
    if ("remove" in row && row.remove) delete target[key];
    else target[key] = row.value;
    expect(() => validateProject(value), row.name).toThrow();
  }
});

test("本文全体のUTF-8容量、写真のデコード容量、JSON総容量に上限を設ける", () => {
  const project = validateProject(structuredClone(empty));
  project.career.summary = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "日".repeat(22000) }] }],
  };
  expect(() => validateProject(project)).toThrow();
  project.career.summary = { type: "doc" };
  project.assets = [
    {
      id: "photo",
      mediaType: "image/png",
      base64: "A".repeat(Math.ceil((MAX_IMAGE_BYTES + 1) / 3) * 4),
    },
  ];
  expect(() => validateProject(project)).toThrow();
  expect(() => validateProject({ title: "x".repeat(MAX_PROJECT_BYTES + 1) })).toThrow();
});

test("深すぎる本文とリスト、要素数超過、循環入力を拒否する", () => {
  const value = structuredClone(empty);
  let block: unknown = { type: "paragraph" };
  for (let i = 0; i < 5; i++)
    block = {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph" }, block] }],
    };
  expect(() =>
    validateProject({
      ...value,
      career: { ...value.career, summary: { type: "doc", content: [block] } },
    }),
  ).toThrow();
  const paragraphs = Array.from({ length: 10000 }, () => ({ type: "paragraph" }));
  expect(() =>
    validateProject({
      ...value,
      career: { ...value.career, summary: { type: "doc", content: paragraphs } },
    }),
  ).toThrow();
  const cyclic: { child?: unknown } = {};
  cyclic.child = cyclic;
  expect(() => validateProject(cyclic)).toThrow();
});

test("旧JSONの資格を独立データへ移し、明示的な空欄と書類別の検証を維持する", () => {
  const copy = structuredClone(full);
  const career: Omit<typeof copy.career, "qualifications"> & {
    qualifications?: typeof copy.career.qualifications;
  } = { ...copy.career };
  delete career.qualifications;
  const legacy = { ...copy, career };
  legacy.career.skills[0].id = "career-qualification-legacy-1";
  const restored = validateProject(legacy);
  expect(restored.career.qualifications).toEqual([
    { ...full.resume.qualifications[0], id: "career-qualification-legacy-2" },
  ]);
  expect(legacy.career.qualifications).toBeUndefined();
  restored.career.qualifications[0].text = "職務経歴書専用";
  expect(restored.resume.qualifications[0].text).toBe("架空資格");
  restored.career.qualifications = [];
  expect(validateProject(restored).career.qualifications).toEqual([]);
  for (const field of ["yearMonth", "id"] as const) {
    const invalid = structuredClone(full);
    invalid.career.qualifications[0][field] =
      field === "yearMonth" ? "2024-13" : invalid.resume.qualifications[0].id;
    expect(() => validateProject(invalid)).toThrow();
  }
});
