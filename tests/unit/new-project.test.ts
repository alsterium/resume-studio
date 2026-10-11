import { expect, test } from "vitest";
import { newProject } from "../../src/domain/new-project";

test("新規プロジェクトは職務経歴書テンプレート1.2.0を既定にする", () => {
  expect(newProject().templates.career).toEqual({ id: "career-standard", version: "1.2.0" });
});
