use crate::compiler::diagnostics::{diagnose, TexDiagnostics, TexRuntime};
use crate::{
    compiler::{compile::compile, results::PdfStore},
    generator::{generate, Draft},
};

#[tauri::command]
pub async fn diagnose_tex() -> Result<TexDiagnostics, String> {
    tauri::async_runtime::spawn_blocking(|| diagnose(&TexRuntime::discover()))
        .await
        .map_err(|error| error.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPdf {
    result_id: String,
}

#[tauri::command]
pub async fn generate_draft(
    draft: Draft,
    store: tauri::State<'_, PdfStore>,
) -> Result<GeneratedPdf, String> {
    let bundle = generate(&draft)?;
    let artifact =
        tauri::async_runtime::spawn_blocking(move || compile(&TexRuntime::discover(), &bundle))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("{} ({})\n{}", e.message, e.code, e.log))?;
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
