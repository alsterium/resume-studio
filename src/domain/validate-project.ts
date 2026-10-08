import validateSchema from "../../.generated/project-validator.js";
import { isYearMonth, parseDate } from "./dates";
import type { BodyDoc, BlockNode, InlineNode, ListItem, Project } from "./project";

export const MAX_PROJECT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const encoder = new TextEncoder();
function invalid(message: string): never {
  throw new Error(message);
}

export function validateProject(value: unknown): Project {
  // Bound recursive schema validation and stringify, including cyclic JS input.
  const stack = [{ value, depth: 0 }];
  const reservedIds = new Set<string>();
  let count = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (
      current.value &&
      typeof current.value === "object" &&
      "id" in current.value &&
      typeof current.value.id === "string"
    )
      reservedIds.add(current.value.id);
    if (++count > 200000 || current.depth > 64) invalid("JSONの構造が上限を超えています。");
    if (current.value !== null && typeof current.value === "object")
      for (const child of Object.values(current.value))
        stack.push({ value: child, depth: current.depth + 1 });
  }
  if (encoder.encode(JSON.stringify(value) ?? "").length > MAX_PROJECT_BYTES)
    invalid("JSONは20MiB以内にしてください。");
  if (!validateSchema(value)) invalid("プロジェクトの構造または版に対応していません。");
  const project: Project = { ...value, career: { ...value.career } };
  if (project.career.qualifications === undefined) {
    let sequence = 1;
    project.career.qualifications = project.resume.qualifications.map((row) => {
      let id: string;
      do {
        id = `career-qualification-legacy-${sequence++}`;
      } while (reservedIds.has(id));
      reservedIds.add(id);
      return { ...row, id };
    });
  }
  if (!parseDate(project.documentDate)) invalid("書類日付が不正です。");
  if (project.profile.birthDate && !parseDate(project.profile.birthDate))
    invalid("生年月日が不正です。");

  const ids = new Set<string>();
  const id = (value: string) => {
    if (ids.has(value)) invalid("行・案件・写真のIDが重複しています。");
    ids.add(value);
  };
  const month = (value: string) => {
    if (value && !isYearMonth(value)) invalid("年月が不正です。");
  };
  const period = (start: string, end: string | null) => {
    month(start);
    if (end !== null) month(end);
    if (start && end && end < start) invalid("終了年月が開始年月より前です。");
  };
  for (const rows of [
    project.resume.education,
    project.resume.employment,
    project.resume.qualifications,
    project.career.qualifications,
  ])
    for (const row of rows) {
      id(row.id);
      month(row.yearMonth);
    }
  const bodies = [
    project.resume.motivation,
    project.resume.preferences,
    project.career.summary,
    project.career.selfPromotion,
  ];
  for (const position of project.career.positions) {
    id(position.id);
    period(position.startYearMonth, position.endYearMonth);
    for (const item of position.projects) {
      id(item.id);
      period(item.startYearMonth, item.endYearMonth);
      bodies.push(item.overview, item.responsibilities, item.achievements);
      if (item.url) {
        let url: URL;
        try {
          url = new URL(item.url);
        } catch {
          invalid("案件URLが不正です。");
        }
        if (!url!.hostname || !["http:", "https:"].includes(url!.protocol))
          invalid("案件URLが不正です。");
      }
    }
  }
  for (const skill of project.career.skills) id(skill.id);
  for (const asset of project.assets) {
    id(asset.id);
    const decodedLength =
      (asset.base64.length / 4) * 3 -
      (asset.base64.endsWith("==") ? 2 : asset.base64.endsWith("=") ? 1 : 0);
    if (decodedLength > MAX_IMAGE_BYTES) invalid("写真は1枚5MiB以内にしてください。");
  }
  if (
    project.profile.photoAssetId !== null &&
    !project.assets.some((asset) => asset.id === project.profile.photoAssetId)
  )
    invalid("参照する写真が見つかりません。");
  for (const body of bodies) validateBodyBudget(body);
  return project;
}

function validateBodyBudget(body: BodyDoc) {
  type Node = BodyDoc | BlockNode | InlineNode | ListItem;
  const stack: { node: Node; depth: number; lists: number }[] = [
    { node: body, depth: 0, lists: 0 },
  ];
  let nodes = 0;
  let bytes = 0;
  while (stack.length) {
    const { node, depth, lists } = stack.pop()!;
    const isList = node.type === "bulletList" || node.type === "orderedList";
    if (++nodes > 10000 || depth > 16 || (isList && lists >= 4))
      invalid("本文の構造が上限を超えています。");
    if (node.type === "text") bytes += encoder.encode(node.text).length;
    if (node.type === "listItem" && node.content[0]?.type !== "paragraph")
      invalid("リスト項目は段落から始めてください。");
    if ("content" in node)
      for (const child of node.content ?? [])
        stack.push({ node: child, depth: depth + 1, lists: lists + Number(isList) });
  }
  if (bytes > 65536) invalid("本文はUTF-8で64KiB以内にしてください。");
}
