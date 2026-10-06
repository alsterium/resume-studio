use super::GeneratedPdf;
use crate::{
    compiler::{compile::compile, diagnostics::TexRuntime, results::PdfStore},
    domain::validation::parse_project,
    generator::{
        documents::generate_project,
        templates::{bundled_templates, DocumentKind, TemplateManifest},
    },
};

#[tauri::command]
pub fn list_templates() -> Vec<TemplateManifest> {
    bundled_templates()
        .into_iter()
        .map(|template| template.manifest)
        .collect()
}

#[tauri::command]
pub async fn generate_document(
    project: serde_json::Value,
    kind: DocumentKind,
    store: tauri::State<'_, PdfStore>,
) -> Result<GeneratedPdf, String> {
    let artifact = tauri::async_runtime::spawn_blocking(move || {
        let project = parse_project(
            &serde_json::to_vec(&project).map_err(|_| "プロジェクトを確認できませんでした。")?,
        )?;
        let bundle = generate_project(&project, kind)?;
        compile(&TexRuntime::discover(), &bundle)
            .map_err(|error| format!("{} ({})\n{}", error.message, error.code, error.log))
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(GeneratedPdf {
        result_id: store.insert(artifact.bytes)?,
    })
}
