use crate::{
    compiler::{
        compile::compile,
        diagnostics::TexRuntime,
        jobs::{GenerationJobs, JobPhase},
    },
    domain::validation::parse_project,
    generator::{documents::generate_project, templates::DocumentKind},
    storage::outputs::{write_pdf, write_tex},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OutputFormat {
    Pdf,
    Tex,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub kind: DocumentKind,
    pub status: ExportStatus,
    pub display_name: String,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportStatus {
    Saved,
    Skipped,
    Failed,
}

fn select_directory(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Result<Option<PathBuf>, String> {
    #[cfg(feature = "desktop-e2e")]
    if let Some(path) = std::env::var_os("RESUME_STUDIO_E2E_EXPORT") {
        return Ok(Some(PathBuf::from(path)));
    }
    app.dialog()
        .file()
        .set_parent(window)
        .set_title("書類の保存先フォルダを選択")
        .blocking_pick_folder()
        .map(|file| {
            file.into_path()
                .map_err(|_| "通常のフォルダを選択してください。".into())
        })
        .transpose()
}
fn confirm_replace(app: &tauri::AppHandle, window: &tauri::WebviewWindow, name: &str) -> bool {
    #[cfg(feature = "desktop-e2e")]
    if std::env::var_os("RESUME_STUDIO_E2E_EXPORT").is_some() {
        return false;
    }
    app.dialog()
        .message(format!("{name} は既に存在します。上書きしますか？"))
        .parent(window)
        .title("書類の上書き確認")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "上書きする".into(),
            "この書類をスキップ".into(),
        ))
        .blocking_show()
}

#[tauri::command]
pub async fn export_documents(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project: serde_json::Value,
    kinds: Vec<DocumentKind>,
    format: OutputFormat,
    progress: tauri::ipc::Channel<JobPhase>,
    jobs: tauri::State<'_, GenerationJobs>,
) -> Result<Option<Vec<ExportResult>>, String> {
    if kinds.is_empty() || kinds.len() > 2 || (kinds.len() == 2 && kinds[0] == kinds[1]) {
        return Err("書き出す書類を選択してください。".into());
    }
    jobs.execute(
        move |phase| {
            let _ = progress.send(phase);
        },
        move |notify| {
            let project = parse_project(
                &serde_json::to_vec(&project)
                    .map_err(|_| "プロジェクトを確認できませんでした。")?,
            )?;
            let Some(directory) = select_directory(&app, &window)? else {
                return Ok(None);
            };
            let directory = directory
                .canonicalize()
                .map_err(|_| "保存先フォルダを確認できませんでした。")?;
            if !directory.is_dir() {
                return Err("通常の保存先フォルダを選択してください。".into());
            }
            Ok(Some(export_to_directory(
                &project,
                &kinds,
                format,
                &directory,
                &|name| confirm_replace(&app, &window, name),
                notify,
            )))
        },
    )
    .await
}

/// Export each document independently so a failed template or write does not undo another output.
pub fn export_to_directory(
    project: &crate::domain::project::Project,
    kinds: &[DocumentKind],
    format: OutputFormat,
    directory: &std::path::Path,
    confirm_replace: &dyn Fn(&str) -> bool,
    notify: &dyn Fn(JobPhase),
) -> Vec<ExportResult> {
    let mut results = Vec::new();
    for &kind in kinds {
        let label = match kind {
            DocumentKind::Resume => "履歴書",
            DocumentKind::Career => "職務経歴書",
        };
        let name = match format {
            OutputFormat::Pdf => format!("{label}.pdf"),
            OutputFormat::Tex => format!("{label}-tex"),
        };
        let path = directory.join(&name);
        // Broken symlinks also require an explicit decision and are rejected by storage.
        if path.symlink_metadata().is_ok() && !confirm_replace(&name) {
            results.push(ExportResult {
                kind,
                status: ExportStatus::Skipped,
                display_name: name,
                error: None,
            });
            continue;
        }
        let result = (|| {
            notify(JobPhase::Generating);
            let bundle = generate_project(project, kind)?;
            match format {
                OutputFormat::Tex => write_tex(&path, &bundle),
                OutputFormat::Pdf => {
                    notify(JobPhase::Compiling);
                    let artifact = compile(&TexRuntime::discover(), &bundle).map_err(|error| {
                        format!("{} ({})\n{}", error.message, error.code, error.log)
                    })?;
                    write_pdf(&path, &artifact.bytes)
                }
            }
        })();
        results.push(ExportResult {
            kind,
            status: if result.is_ok() {
                ExportStatus::Saved
            } else {
                ExportStatus::Failed
            },
            display_name: name,
            error: result.err(),
        });
    }
    results
}
