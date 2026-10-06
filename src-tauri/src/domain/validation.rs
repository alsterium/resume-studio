use super::{
    dates::{is_year_month, parse_date},
    project::Project,
};
use crate::generator::body::render_body;
use serde_json::Value;
use std::{collections::HashSet, sync::LazyLock};

pub const MAX_PROJECT_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
static SCHEMA: LazyLock<jsonschema::Validator> = LazyLock::new(|| {
    let schema: Value =
        serde_json::from_str(include_str!("../../../schemas/project-v1.schema.json"))
            .expect("bundled schema");
    jsonschema::options()
        .build(&schema)
        .expect("valid bundled schema")
});

pub fn parse_project(bytes: &[u8]) -> Result<Project, String> {
    if bytes.len() > MAX_PROJECT_BYTES {
        return Err("JSONは20MiB以内にしてください。".into());
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "JSONを読み込めませんでした。")?;
    let mut stack = vec![(&value, 0)];
    let mut count = 0;
    while let Some((value, depth)) = stack.pop() {
        count += 1;
        if count > 200000 || depth > 64 {
            return Err("JSONの構造が上限を超えています。".into());
        }
        match value {
            Value::Array(items) => stack.extend(items.iter().map(|v| (v, depth + 1))),
            Value::Object(items) => stack.extend(items.values().map(|v| (v, depth + 1))),
            _ => {}
        }
    }
    if !SCHEMA.is_valid(&value) {
        return Err("プロジェクトの構造または版に対応していません。".into());
    }
    let project: Project =
        serde_json::from_value(value).map_err(|_| "プロジェクトの型が不正です。")?;
    validate_semantics(&project)?;
    Ok(project)
}

pub fn encode_project(project: &Project) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec_pretty(project).map_err(|_| "JSONを生成できませんでした。")?;
    parse_project(&bytes)?;
    Ok(bytes)
}

fn month(value: &str) -> Result<(), String> {
    if !value.is_empty() && !is_year_month(value) {
        return Err("年月が不正です。".into());
    }
    Ok(())
}
fn period(start: &str, end: Option<&str>) -> Result<(), String> {
    month(start)?;
    if let Some(end) = end {
        month(end)?;
        if !start.is_empty() && !end.is_empty() && end < start {
            return Err("終了年月が開始年月より前です。".into());
        }
    }
    Ok(())
}
fn insert_id(ids: &mut HashSet<String>, id: &str) -> Result<(), String> {
    if !ids.insert(id.to_owned()) {
        return Err("行・案件・写真のIDが重複しています。".into());
    }
    Ok(())
}
fn validate_semantics(project: &Project) -> Result<(), String> {
    if parse_date(&project.document_date).is_none() {
        return Err("書類日付が不正です。".into());
    }
    if !project.profile.birth_date.is_empty() && parse_date(&project.profile.birth_date).is_none() {
        return Err("生年月日が不正です。".into());
    }
    let mut ids = HashSet::new();
    for rows in [
        &project.resume.education,
        &project.resume.employment,
        &project.resume.qualifications,
    ] {
        for row in rows {
            insert_id(&mut ids, &row.id)?;
            month(&row.year_month)?;
        }
    }
    let mut bodies = vec![
        &project.resume.motivation,
        &project.resume.preferences,
        &project.career.summary,
        &project.career.self_promotion,
    ];
    for position in &project.career.positions {
        insert_id(&mut ids, &position.id)?;
        period(
            &position.start_year_month,
            position.end_year_month.as_deref(),
        )?;
        for item in &position.projects {
            insert_id(&mut ids, &item.id)?;
            period(&item.start_year_month, item.end_year_month.as_deref())?;
            bodies.extend([&item.overview, &item.responsibilities, &item.achievements]);
            if let Some(url) = item.url.as_deref().filter(|url| !url.is_empty()) {
                let parsed = url::Url::parse(url).map_err(|_| "案件URLが不正です。")?;
                if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
                    return Err("案件URLが不正です。".into());
                }
            }
        }
    }
    for skill in &project.career.skills {
        insert_id(&mut ids, &skill.id)?;
    }
    for asset in &project.assets {
        insert_id(&mut ids, &asset.id)?;
        let padding = if asset.base64.ends_with("==") {
            2
        } else {
            usize::from(asset.base64.ends_with('='))
        };
        if asset.base64.len() / 4 * 3 - padding > MAX_IMAGE_BYTES {
            return Err("写真は1枚5MiB以内にしてください。".into());
        }
        crate::storage::photos::validate_asset(asset)?;
    }
    if let Some(id) = &project.profile.photo_asset_id {
        if !project.assets.iter().any(|asset| &asset.id == id) {
            return Err("参照する写真が見つかりません。".into());
        }
    }
    for body in bodies {
        render_body(body)?;
    }
    Ok(())
}
