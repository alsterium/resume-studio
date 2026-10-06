use crate::generator::body::BodyNode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub schema_version: u8,
    pub project_id: String,
    pub title: String,
    pub document_date: String,
    pub profile: Profile,
    pub resume: Resume,
    pub career: Career,
    pub templates: Templates,
    pub assets: Vec<Asset>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub name: String,
    pub name_kana: String,
    pub birth_date: String,
    pub postal_code: String,
    pub address: String,
    pub address_kana: String,
    pub phone: String,
    pub email: String,
    pub photo_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gender_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternate_contact: Option<Contact>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Contact {
    pub postal_code: String,
    pub address: String,
    pub address_kana: String,
    pub phone: String,
    pub email: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryRow {
    pub id: String,
    pub year_month: String,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Resume {
    pub education: Vec<HistoryRow>,
    pub employment: Vec<HistoryRow>,
    pub qualifications: Vec<HistoryRow>,
    pub motivation: BodyNode,
    pub preferences: BodyNode,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Career {
    pub summary: BodyNode,
    pub positions: Vec<Position>,
    pub skills: Vec<Skill>,
    pub self_promotion: BodyNode,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Position {
    pub id: String,
    pub company_name: String,
    pub start_year_month: String,
    pub end_year_month: Option<String>,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_overview: Option<CompanyOverview>,
    pub projects: Vec<CareerProject>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompanyOverview {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub business: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capital: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub employees: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CareerProject {
    pub id: String,
    pub name: String,
    pub start_year_month: String,
    pub end_year_month: Option<String>,
    pub overview: BodyNode,
    pub phases: Vec<String>,
    pub responsibilities: BodyNode,
    pub achievements: BodyNode,
    pub team_size: String,
    pub languages: Vec<String>,
    pub technologies: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub experience_label: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Templates {
    pub resume: TemplateRef,
    pub career: TemplateRef,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateRef {
    pub id: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Asset {
    pub id: String,
    pub media_type: String,
    pub base64: String,
}
