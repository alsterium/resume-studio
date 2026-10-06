use crate::{
    compiler::{
        compile::compile_with_control,
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
    job_id: String,
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
    job_id: String,
    revision: u64,
    progress: tauri::ipc::Channel<JobPhase>,
    jobs: tauri::State<'_, GenerationJobs>,
    store: tauri::State<'_, PdfStore>,
) -> Result<GeneratedDocument, String> {
    let (project_id, artifact) = jobs
        .execute_cancellable(
            job_id.clone(),
            move |phase| {
                let _ = progress.send(phase);
            },
            move |notify, cancellation| {
                let project = parse_project(
                    &serde_json::to_vec(&project)
                        .map_err(|_| "プロジェクトを確認できませんでした。")?,
                )?;
                notify(JobPhase::Generating);
                let bundle = generate_project(&project, kind)?;
                notify(JobPhase::Compiling);
                let artifact = compile_with_control(
                    &TexRuntime::discover(),
                    &bundle,
                    cancellation,
                    std::time::Duration::from_secs(60),
                )
                .map_err(|error| format!("{} ({})\n{}", error.message, error.code, error.log))?;
                Ok((project.project_id, artifact))
            },
        )
        .await?;
    Ok(GeneratedDocument {
        result_id: store.insert(artifact.bytes)?,
        project_id,
        revision,
        kind,
        job_id,
    })
}

#[tauri::command]
pub fn cancel_generation(
    job_id: String,
    jobs: tauri::State<'_, GenerationJobs>,
) -> Result<bool, String> {
    jobs.cancel(&job_id)
}
