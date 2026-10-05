use crate::compiler::diagnostics::{diagnose, TexDiagnostics, TexRuntime};

#[tauri::command]
pub async fn diagnose_tex() -> Result<TexDiagnostics, String> {
    tauri::async_runtime::spawn_blocking(|| diagnose(&TexRuntime::discover()))
        .await
        .map_err(|error| error.to_string())
}
