use super::{
    body::render_body,
    bundle::BundleResource,
    display_text, escape_text,
    templates::{resolve, DocumentKind},
    GeneratedBundle,
};
use crate::domain::{
    dates::age_on_date,
    project::{Career, Contact, HistoryRow, Profile, Project, Resume},
    validation::encode_project,
};
use crate::storage::photos::prepare_resources;

enum DocumentContent<'a> {
    Resume(&'a Resume),
    Career(&'a Career),
}
struct DocumentModel<'a> {
    date: &'a str,
    template_version: &'a str,
    profile: &'a Profile,
    content: DocumentContent<'a>,
    photo: Option<String>,
}

fn qualification_date(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let (year, month) = value.split_once('-').expect("validated year-month");
    format!(
        "{}年{}月 取得",
        year.parse::<u16>().unwrap(),
        month.parse::<u8>().unwrap()
    )
}

fn command(output: &mut String, name: &str, args: &[String]) {
    output.push('\\');
    output.push_str(name);
    for argument in args {
        output.push('{');
        output.push_str(argument);
        output.push('}');
    }
    output.push('\n');
}
fn field(output: &mut String, title: &str, value: &str) {
    if !value.is_empty() {
        command(
            output,
            "CareerField",
            &[display_text(title), display_text(value)],
        );
    }
}
fn history(output: &mut String, title: &str, rows: &[HistoryRow]) {
    command(output, "ResumeHistoryBegin", &[display_text(title)]);
    for row in rows {
        let (year, month) = row.year_month.split_once('-').unwrap_or(("", ""));
        command(
            output,
            "ResumeHistoryRow",
            &[
                display_text(year),
                display_text(month.trim_start_matches('0')),
                display_text(&row.text),
            ],
        );
    }
    command(output, "ResumeHistoryEnd", &[]);
}
fn contact(output: &mut String, title: &str, contact: &Contact) {
    command(
        output,
        "ResumeContact",
        &[
            display_text(title),
            display_text(&contact.postal_code),
            display_text(&contact.address),
            display_text(&contact.address_kana),
            display_text(&contact.phone),
            display_text(&contact.email),
        ],
    );
}
fn career_year_month(value: &str, localized: bool) -> String {
    if !localized {
        return value.to_owned();
    }
    let Some((year, month)) = value.split_once('-') else {
        return value.to_owned();
    };
    match month.parse::<u8>() {
        Ok(month) => format!("{year}年{month}月"),
        Err(_) => value.to_owned(),
    }
}
fn period(start: &str, end: Option<&str>, ongoing: &str, localized: bool) -> String {
    let start = career_year_month(start, localized);
    let end = end
        .map(|value| career_year_month(value, localized))
        .unwrap_or_else(|| ongoing.to_owned());
    format!("{start} ～ {end}")
}
fn skill_experience(value: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|character| character.is_ascii_digit() || ('０'..='９').contains(&character))
    {
        format!("{trimmed}年以上")
    } else {
        value.to_owned()
    }
}
fn document_date(value: &str) -> String {
    let parts: Vec<_> = value.split('-').collect();
    match parts.as_slice() {
        [year, month, day] => format!(
            "{year}年{}月{}日",
            month.trim_start_matches('0'),
            day.trim_start_matches('0')
        ),
        _ => value.to_owned(),
    }
}
fn render_url(value: &str) -> Result<(String, String), String> {
    let url = url::Url::parse(value).map_err(|_| "案件URLが不正です。")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("案件URLが不正です。".into());
    }
    let label = value
        .chars()
        .map(|c| {
            let mut text = escape_text(&c.to_string());
            // A URL may contain a path segment longer than the entire paper width.
            // Keep every displayed character while permitting a break anywhere.
            text.push_str("\\allowbreak{}");
            text
        })
        .collect();
    Ok((escape_text(url.as_str()), label))
}
fn render(model: &DocumentModel<'_>) -> Result<String, String> {
    let mut output = String::new();
    match model.content {
        DocumentContent::Resume(resume) => {
            command(
                &mut output,
                "ResumeHeader",
                &[display_text(&document_date(model.date))],
            );
            let age = age_on_date(&model.profile.birth_date, model.date)
                .map(|age| format!("満{age}歳"))
                .unwrap_or_default();
            let photo = model
                .photo
                .as_ref()
                .map(|name| format!("\\ResumePhoto{{{name}}}"))
                .unwrap_or_default();
            command(
                &mut output,
                "ResumeProfile",
                &[
                    display_text(&model.profile.name_kana),
                    display_text(&model.profile.name),
                    display_text(&document_date(&model.profile.birth_date)),
                    age,
                    display_text(model.profile.gender_label.as_deref().unwrap_or_default()),
                    photo,
                ],
            );
            contact(
                &mut output,
                "現住所",
                &Contact {
                    postal_code: model.profile.postal_code.clone(),
                    address: model.profile.address.clone(),
                    address_kana: model.profile.address_kana.clone(),
                    phone: model.profile.phone.clone(),
                    email: model.profile.email.clone(),
                },
            );
            contact(
                &mut output,
                "別連絡先",
                model
                    .profile
                    .alternate_contact
                    .as_ref()
                    .unwrap_or(&Contact {
                        postal_code: String::new(),
                        address: String::new(),
                        address_kana: String::new(),
                        phone: String::new(),
                        email: String::new(),
                    }),
            );
            history(&mut output, "学歴", &resume.education);
            history(&mut output, "職歴", &resume.employment);
            history(&mut output, "免許・資格", &resume.qualifications);
            command(
                &mut output,
                "ResumeBody",
                &[
                    "志望動機・特技・アピールポイントなど".into(),
                    render_body(&resume.motivation)?,
                ],
            );
            command(
                &mut output,
                "ResumeBody",
                &["本人希望欄".into(), render_body(&resume.preferences)?],
            );
        }
        DocumentContent::Career(career) => {
            command(
                &mut output,
                "CareerHeader",
                &[
                    display_text(&document_date(model.date)),
                    display_text(&model.profile.name),
                ],
            );
            command(
                &mut output,
                if model.template_version == "1.2.0" {
                    "CareerSummarySection"
                } else {
                    "CareerSection"
                },
                &["経歴要約".into()],
            );
            output.push_str(&render_body(&career.summary)?);
            command(
                &mut output,
                if model.template_version == "1.2.0" {
                    "CareerSkillsSection"
                } else {
                    "CareerSection"
                },
                &["活かせるスキル・経験".into()],
            );
            for skill in &career.skills {
                let experience = if model.template_version == "1.2.0" {
                    skill_experience(&skill.experience_label)
                } else {
                    skill.experience_label.clone()
                };
                let label = if experience.is_empty() {
                    skill.name.clone()
                } else {
                    format!("{}（{}）", skill.name, experience)
                };
                command(
                    &mut output,
                    "CareerSkill",
                    &[display_text(&label), display_text(&skill.description)],
                );
            }
            for qualification in &career.qualifications {
                command(
                    &mut output,
                    if model.template_version == "1.2.0" {
                        "CareerQualification"
                    } else {
                        "CareerSkill"
                    },
                    &[
                        display_text(&qualification.text),
                        display_text(&qualification_date(&qualification.year_month)),
                    ],
                );
            }
            command(&mut output, "CareerSection", &["職務経歴".into()]);
            for position in &career.positions {
                command(
                    &mut output,
                    "CareerCompany",
                    &[
                        display_text(&position.company_name),
                        display_text(&period(
                            &position.start_year_month,
                            position.end_year_month.as_deref(),
                            "在籍中",
                            model.template_version == "1.2.0",
                        )),
                    ],
                );
                field(&mut output, "役職・役割", &position.role);
                if let Some(overview) = &position.company_overview {
                    for (label, value) in [
                        ("事業内容", &overview.business),
                        ("資本金", &overview.capital),
                        ("従業員数", &overview.employees),
                    ] {
                        field(&mut output, label, value.as_deref().unwrap_or_default());
                    }
                }
                if !position.projects.is_empty() {
                    command(&mut output, "CareerProjects", &[]);
                }
                for item in &position.projects {
                    command(
                        &mut output,
                        "CareerProject",
                        &[
                            display_text(&item.name),
                            display_text(&period(
                                &item.start_year_month,
                                item.end_year_month.as_deref(),
                                "進行中",
                                model.template_version == "1.2.0",
                            )),
                        ],
                    );
                    if item.overview.has_content() {
                        command(
                            &mut output,
                            "CareerBody",
                            &["プロジェクト概要".into(), render_body(&item.overview)?],
                        );
                    }
                    field(&mut output, "担当フェーズ", &item.phases.join("、"));
                    for (label, body) in [
                        ("業務内容", &item.responsibilities),
                        ("実績・取り組み", &item.achievements),
                    ] {
                        if body.has_content() {
                            command(
                                &mut output,
                                "CareerBody",
                                &[display_text(label), render_body(body)?],
                            );
                        }
                    }
                    field(&mut output, "プロジェクト規模", &item.team_size);
                    for (label, items) in [
                        ("使用言語", &item.languages),
                        ("使用技術", &item.technologies),
                    ] {
                        field(&mut output, label, &items.join("、"));
                    }
                    if let Some(value) = item.url.as_deref().filter(|value| !value.is_empty()) {
                        let (target, label) = render_url(value)?;
                        command(&mut output, "CareerURL", &[target, label]);
                    }
                }
            }
            if career.self_promotion.has_content() {
                command(&mut output, "CareerSection", &["自己PR".into()]);
                output.push_str(&render_body(&career.self_promotion)?);
            }
        }
    }
    Ok(output)
}

pub fn generate_project(project: &Project, kind: DocumentKind) -> Result<GeneratedBundle, String> {
    encode_project(project)?;
    let reference = match kind {
        DocumentKind::Resume => &project.templates.resume,
        DocumentKind::Career => &project.templates.career,
    };
    let template = resolve(reference, kind, project.schema_version)?;
    let mut resources = vec![
        BundleResource {
            name: template.style_name.into(),
            bytes: template.style.as_bytes().to_vec(),
        },
        BundleResource {
            name: "manifest.json".into(),
            bytes: template.manifest_json.as_bytes().to_vec(),
        },
    ];
    let mut photo = None;
    if kind == DocumentKind::Resume {
        if let Some(asset) = project
            .assets
            .iter()
            .find(|asset| Some(&asset.id) == project.profile.photo_asset_id.as_ref())
        {
            for resource in prepare_resources(std::slice::from_ref(asset))? {
                photo = Some(resource.file_name.clone());
                resources.push(BundleResource {
                    name: resource.file_name,
                    bytes: resource.bytes,
                });
            }
        }
    }
    let date =
        project.effective_document_date(&chrono::Local::now().format("%Y-%m-%d").to_string());
    let model = DocumentModel {
        date: &date,
        template_version: &template.manifest.version,
        profile: &project.profile,
        photo,
        content: match kind {
            DocumentKind::Resume => DocumentContent::Resume(&project.resume),
            DocumentKind::Career => DocumentContent::Career(&project.career),
        },
    };
    let content_tex = render(&model)?;
    if content_tex.len() > 64 * 1024 * 1024 {
        return Err("生成TeXが64MiBを超えています。".into());
    }
    Ok(GeneratedBundle {
        main_tex: template.main_tex.into(),
        content_tex,
        resources,
    })
}

#[cfg(test)]
mod tests {
    use super::{career_year_month, document_date, period, render_url, skill_experience};

    #[test]
    fn document_dates_keep_the_year_and_allow_an_empty_birth_date() {
        assert_eq!(document_date("2026-10-06"), "2026年10月6日");
        assert_eq!(document_date("0001-01-01"), "0001年1月1日");
        assert_eq!(document_date(""), "");
    }

    #[test]
    fn urls_keep_click_targets_and_escape_breakable_labels() {
        let (target, label) =
            render_url("https://example.com/%7Btext%7D?a=1&b=2#fragment").unwrap();
        assert_eq!(
            target,
            r"https://example.com/\%7Btext\%7D?a=1\&b=2\#fragment"
        );
        assert_eq!(
            label.replace(r"\allowbreak{}", ""),
            r"https://example.com/\%7Btext\%7D?a=1\&b=2\#fragment"
        );
        assert_eq!(label.matches(r"\allowbreak{}").count(), 47);
        let (target, label) = render_url("https://example.com/日本語").unwrap();
        assert!(target.contains(r"\%E6\%97\%A5"));
        assert!(label.ends_with(r"日\allowbreak{}本\allowbreak{}語\allowbreak{}"));
    }

    #[test]
    fn urls_reject_non_http_schemes_and_missing_hosts() {
        for value in [
            "javascript:alert(1)",
            "file:///private/file",
            "mailto:sample@example.com",
            "",
            "relative/path",
            "https://",
        ] {
            assert!(render_url(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn career_v1_2_formats_year_month_and_numeric_skill_experience() {
        assert_eq!(career_year_month("2020-02", true), "2020年2月");
        assert_eq!(career_year_month("2020-10", true), "2020年10月");
        assert_eq!(career_year_month("2020-02", false), "2020-02");
        assert_eq!(
            period("2020-02", Some("2021-10"), "在籍中", true),
            "2020年2月 ～ 2021年10月"
        );
        assert_eq!(
            period("2020-02", None, "在籍中", true),
            "2020年2月 ～ 在籍中"
        );
        for (input, expected) in [
            ("3", "3年以上"),
            ("12", "12年以上"),
            ("０", "０年以上"),
            ("３", "３年以上"),
            (" 3 ", "3年以上"),
            ("3年", "3年"),
            ("3年以上", "3年以上"),
            ("半年", "半年"),
            ("約3年", "約3年"),
            ("3年6か月", "3年6か月"),
            ("3.5", "3.5"),
            (" 3年 ", " 3年 "),
            ("", ""),
            (" ", " "),
        ] {
            assert_eq!(skill_experience(input), expected, "{input:?}");
        }
    }
}
