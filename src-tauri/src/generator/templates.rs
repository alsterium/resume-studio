use crate::domain::project::TemplateRef;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentKind {
    Resume,
    Career,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateManifest {
    pub id: String,
    pub version: String,
    pub display_name: String,
    pub document_kind: DocumentKind,
    pub schema_versions: Vec<u8>,
    pub engine: String,
    pub packages: Vec<String>,
    pub fonts: Vec<String>,
}

pub struct Template {
    pub manifest: TemplateManifest,
    pub manifest_json: &'static str,
    pub main_tex: &'static str,
    pub style_name: &'static str,
    pub style: &'static str,
}
pub fn bundled_templates() -> Vec<Template> {
    [
        (
            include_str!("../../templates/resume-standard/manifest.json"),
            include_str!("../../templates/resume-standard/main.tex"),
            "resume.sty",
            include_str!("../../templates/resume-standard/resume.sty"),
        ),
        (
            include_str!("../../templates/career-standard/manifest.json"),
            include_str!("../../templates/career-standard/main.tex"),
            "career.sty",
            include_str!("../../templates/career-standard/career.sty"),
        ),
    ]
    .into_iter()
    .map(|(manifest_json, main_tex, style_name, style)| Template {
        manifest: serde_json::from_str(manifest_json).expect("bundled template manifest"),
        manifest_json,
        main_tex,
        style_name,
        style,
    })
    .collect()
}
pub fn resolve(
    reference: &TemplateRef,
    kind: DocumentKind,
    schema_version: u8,
) -> Result<Template, String> {
    bundled_templates().into_iter().find(|template| template.manifest.id == reference.id && template.manifest.version == reference.version && template.manifest.document_kind == kind && template.manifest.schema_versions.contains(&schema_version) && template.manifest.engine == "lualatex")
        .ok_or_else(|| "指定した書類のテンプレートID・版に対応していません。利用可能なテンプレートを選択してください。(TEMPLATE_NOT_FOUND)".into())
}
