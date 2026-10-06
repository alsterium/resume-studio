use crate::{
    compiler::{
        compile::compile,
        diagnostics::TexRuntime,
        jobs::{GenerationJobs, JobPhase},
        results::PdfStore,
    },
    domain::validation::parse_project,
    generator::{
        documents::generate_project,
        templates::{bundled_templates, DocumentKind, TemplateManifest},
    },
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDocument {
    result_id: String,
    project_id: String,
    revision: u64,
    kind: DocumentKind,
}

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
    revision: u64,
    progress: tauri::ipc::Channel<JobPhase>,
    jobs: tauri::State<'_, GenerationJobs>,
    store: tauri::State<'_, PdfStore>,
) -> Result<GeneratedDocument, String> {
    let (project_id, artifact) = jobs
        .execute(
            move |phase| {
                let _ = progress.send(phase);
            },
            move |notify| {
                let project = parse_project(
                    &serde_json::to_vec(&project)
                        .map_err(|_| "プロジェクトを確認できませんでした。")?,
                )?;
                notify(JobPhase::Generating);
                let bundle = generate_project(&project, kind)?;
                notify(JobPhase::Compiling);
                let artifact = compile(&TexRuntime::discover(), &bundle).map_err(|error| {
                    format!("{} ({})\n{}", error.message, error.code, error.log)
                })?;
                Ok((project.project_id, artifact))
            },
        )
        .await?;
    Ok(GeneratedDocument {
        result_id: store.insert(artifact.bytes)?,
        project_id,
        revision,
        kind,
    })
}
