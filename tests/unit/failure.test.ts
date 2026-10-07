import { expect, test } from "vitest";
import { describeFailure } from "../../src/features/errors/failure";

test("既知の先頭行末コードだけを解析し、ログの改行と文字を維持する", () => {
  const detail = describeFailure(
    "PDF生成に失敗しました。 (COMPILE_FAILED)\r\n! error\n架空 <script>入力</script>\n",
  );
  expect(detail.message).toBe("PDF生成に失敗しました。");
  expect(detail.code).toBe("COMPILE_FAILED");
  expect(detail.log).toBe("! error\n架空 <script>入力</script>\n");
  expect(detail.guidance).toContain("生成ログ");
});
test("本文内・未知コード・コード風入力を誤分類しない", () => {
  for (const value of [
    "入力\n(TEX_NOT_FOUND)",
    "入力 (UNKNOWN_CODE)\nlog",
    "入力 (TIMEOUT) 追加",
  ]) {
    const detail = describeFailure(value);
    expect(detail.message).toBe(value);
    expect(detail.code).toBeUndefined();
    expect(detail.log).toBeUndefined();
  }
});
test("構造化診断とログなしのエラーにも対処を表示する", () => {
  const value = { code: "TEX_DEPENDENCY_MISSING", message: "不足", log: "" };
  expect(describeFailure(value)).toMatchObject({
    ...value,
    guidance: expect.stringContaining("パッケージ"),
  });
  expect(describeFailure("指定した版に対応していません。(TEMPLATE_NOT_FOUND)").code).toBe(
    "TEMPLATE_NOT_FOUND",
  );
  expect(describeFailure("指定した版に対応していません。 (TEMPLATE_NOT_FOUND)").guidance).toContain(
    "テンプレート",
  );
  expect(describeFailure("latexmkが見つかりません。 (TEX_NOT_FOUND)").guidance).toContain(
    "TeX一式",
  );
});
