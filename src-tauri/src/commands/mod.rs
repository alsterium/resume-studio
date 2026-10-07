use crate::compiler::diagnostics::{diagnose, TexDiagnostics, TexRuntime};
pub mod close;
pub mod documents;
pub mod exports;
pub mod files;
pub mod photos;
use crate::{
    compiler::{
        compile::compile,
        jobs::{GenerationJobs, JobPhase},
        results::PdfStore,
    },
    generator::{generate, Draft},
};

#[tauri::command]
pub async fn diagnose_tex(
    jobs: tauri::State<'_, GenerationJobs>,
) -> Result<TexDiagnostics, String> {
    jobs.execute(|_| {}, |_| Ok(diagnose(&TexRuntime::discover())))
        .await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPdf {
    result_id: String,
}

#[tauri::command]
pub async fn generate_draft(
    draft: Draft,
    jobs: tauri::State<'_, GenerationJobs>,
    store: tauri::State<'_, PdfStore>,
) -> Result<GeneratedPdf, String> {
    let artifact = jobs
        .execute(
            |_| {},
            move |notify| {
                let bundle = generate(&draft)?;
                notify(JobPhase::Compiling);
                compile(&TexRuntime::discover(), &bundle)
                    .map_err(|e| format!("{} ({})\n{}", e.message, e.code, e.log))
            },
        )
        .await?;
    Ok(GeneratedPdf {
        result_id: store.insert(artifact.bytes)?,
    })
}

#[tauri::command]
pub fn read_pdf(
    result_id: String,
    store: tauri::State<'_, PdfStore>,
) -> Result<tauri::ipc::Response, String> {
    store.read(&result_id).map(tauri::ipc::Response::new)
}
