import { expect, test } from "vitest";
import {
  beginSession,
  editSession,
  hasUnsavedChanges,
  recordSaved,
} from "../../src/domain/session";
import { newProject } from "../../src/domain/new-project";

test("保存中の追加編集は保存済みrevisionから除外し、次の保存で解消する", () => {
  const initial = beginSession(newProject());
  expect(hasUnsavedChanges(initial)).toBe(false);
  const snapshot = editSession(initial, { ...initial.project, title: "保存対象" });
  const edited = editSession(snapshot, { ...snapshot.project, title: "追加編集" });
  const completed = recordSaved(edited, snapshot);
  expect(completed.project.title).toBe("追加編集");
  expect(hasUnsavedChanges(completed)).toBe(true);
  expect(hasUnsavedChanges(recordSaved(completed, edited))).toBe(false);
});

test("別プロジェクトと遅延した古い保存は現在の保存状態を巻き戻さない", () => {
  const first = editSession(beginSession(newProject()), newProject());
  const second = beginSession(newProject());
  expect(recordSaved(second, first)).toBe(second);
  const newer = editSession(first, { ...first.project, title: "次の編集" });
  const saved = recordSaved(newer, newer);
  expect(hasUnsavedChanges(recordSaved(saved, first))).toBe(false);
});
