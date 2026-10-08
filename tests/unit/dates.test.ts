import { expect, test } from "vitest";
import cases from "../fixtures/date-cases.json";
import { ageOnDate, isYearMonth, parseDate } from "../../src/domain/dates";

test("日付と年月はISO形式・実在日・世紀の閏年規則を検証する", () => {
  for (const value of cases.valid) expect(parseDate(value), value).not.toBeNull();
  for (const value of cases.invalid) expect(parseDate(value), value).toBeNull();
  for (const value of cases.validYearMonth) expect(isYearMonth(value), value).toBe(true);
  for (const value of cases.invalidYearMonth) expect(isYearMonth(value), value).toBe(false);
});

test("年齢は書類日付時点の誕生日境界で求め、不正・未来の生年月日は表示しない", () => {
  for (const row of cases.ages)
    expect(ageOnDate(row.birthDate, row.documentDate), JSON.stringify(row)).toBe(row.expected);
});

test("今日モードだけローカル日付を解決し、指定日と元のデータを保持する", async () => {
  const { localDate, effectiveDocumentDate } = await import("../../src/domain/dates");
  const now = new Date(2027, 0, 1, 0, 5);
  expect(localDate(now)).toBe("2027-01-01");
  const fixed = { documentDate: "2020-04-01" };
  expect(effectiveDocumentDate(fixed, "2027-01-01")).toBe("2020-04-01");
  expect(effectiveDocumentDate({ ...fixed, documentDateMode: "fixed" }, "2027-01-01")).toBe(
    "2020-04-01",
  );
  const dynamic = { ...fixed, documentDateMode: "today" as const };
  expect(effectiveDocumentDate(dynamic, "2027-01-01")).toBe("2027-01-01");
  expect(effectiveDocumentDate(dynamic, "2027-01-02")).toBe("2027-01-02");
  expect(dynamic.documentDate).toBe("2020-04-01");
});
