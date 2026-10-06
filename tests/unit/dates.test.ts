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
