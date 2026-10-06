/// Calendar dates are parsed without a timezone or system clock.
pub fn parse_date(value: &str) -> Option<(u16, u8, u8)> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return None;
    }
    let year: u16 = value[..4].parse().ok()?;
    let month: u8 = value[5..7].parse().ok()?;
    let day: u8 = value[8..].parse().ok()?;
    if year == 0 || !(1..=12).contains(&month) {
        return None;
    }
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    (day >= 1 && day <= days[usize::from(month - 1)]).then_some((year, month, day))
}

pub fn is_year_month(value: &str) -> bool {
    value.len() == 7 && parse_date(&format!("{value}-01")).is_some()
}

/// A Feb 29 birthday advances on March 1 in non-leap years.
pub fn age_on_date(birth_date: &str, document_date: &str) -> Option<u16> {
    let birth = parse_date(birth_date)?;
    let as_of = parse_date(document_date)?;
    if birth > as_of {
        return None;
    }
    Some(as_of.0 - birth.0 - u16::from((as_of.1, as_of.2) < (birth.1, birth.2)))
}
