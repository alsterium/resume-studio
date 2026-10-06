/** Calendar dates have no timezone. Empty birth dates are handled by the form. */
export function parseDate(value: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1] ? [year, month, day] : null;
}

export function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/u.test(value) && parseDate(`${value}-01`) !== null;
}

/** A Feb 29 birthday advances on March 1 in non-leap years. */
export function ageOnDate(birthDate: string, documentDate: string): number | null {
  const birth = parseDate(birthDate);
  const asOf = parseDate(documentDate);
  if (!birth || !asOf || birthDate > documentDate) return null;
  const birthdayReached = asOf[1] > birth[1] || (asOf[1] === birth[1] && asOf[2] >= birth[2]);
  return asOf[0] - birth[0] - Number(!birthdayReached);
}
