use resume_studio_lib::domain::dates::{age_on_date, is_year_month, parse_date};
use serde_json::Value;

#[test]
fn shared_calendar_fixture_matches_frontend_contract() {
    let cases: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/date-cases.json")).unwrap();
    for key in ["valid", "invalid"] {
        for value in cases[key].as_array().unwrap() {
            let value = value.as_str().unwrap();
            assert_eq!(parse_date(value).is_some(), key == "valid", "{value}");
        }
    }
    for key in ["validYearMonth", "invalidYearMonth"] {
        for value in cases[key].as_array().unwrap() {
            let value = value.as_str().unwrap();
            assert_eq!(is_year_month(value), key == "validYearMonth", "{value}");
        }
    }
    for row in cases["ages"].as_array().unwrap() {
        assert_eq!(
            age_on_date(
                row["birthDate"].as_str().unwrap(),
                row["documentDate"].as_str().unwrap()
            ),
            row["expected"].as_u64().map(|n| u16::try_from(n).unwrap()),
            "{row}"
        );
    }
}
