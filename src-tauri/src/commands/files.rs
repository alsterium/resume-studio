use crate::{
    domain::{project::Project, validation::parse_project},
    storage::{read_project, write_project},
};
use serde::Serialize;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct FileSession {
    next: u64,
    target: Option<(String, PathBuf)>,
}
#[derive(Default)]
pub struct ProjectFiles(Mutex<FileSession>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedProject {
    file_id: String,
    display_name: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProject {
    project: Project,
    file_id: String,
    display_name: String,
}
impl FileSession {
    fn register(&mut self, path: PathBuf) -> SavedProject {
        self.next += 1;
        let file_id = self.next.to_string();
        let display_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        self.target = Some((file_id.clone(), path));
        SavedProject {
            file_id,
            display_name,
        }
    }
    fn target(&self, file_id: &str) -> Result<PathBuf, String> {
        self.target
            .as_ref()
            .filter(|(id, _)| id == file_id)
            .map(|(_, path)| path.clone())
            .ok_or_else(|| "保存先が見つかりません。名前を付けて保存してください。".into())
    }
}

fn select_project_path(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    save: bool,
) -> Result<Option<PathBuf>, String> {
    // Only the explicitly enabled desktop test build can replace the native picker.
    // Storage, validation and the production IPC permissions remain unchanged.
    #[cfg(feature = "desktop-e2e")]
    if let Some(path) = std::env::var_os("RESUME_STUDIO_E2E_PROJECT") {
        return Ok(Some(PathBuf::from(path)));
    }
    let picker = app
        .dialog()
        .file()
        .set_parent(window)
        .add_filter("Resume Studio JSON", &["json"]);
    let selected = if save {
        picker.set_file_name("応募書類.json").blocking_save_file()
    } else {
        picker.blocking_pick_file()
    };
    selected
        .map(|file| {
            file.into_path()
                .map_err(|_| "通常のJSONファイルを選択してください。".into())
        })
        .transpose()
}

#[tauri::command]
pub async fn open_project(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<OpenedProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ProjectFiles>();
        let mut session = state
            .0
            .try_lock()
            .map_err(|_| "別のファイル操作が進行中です。")?;
        let Some(selected) = select_project_path(&app, &window, false)? else {
            return Ok(None);
        };
        let path = selected
            .canonicalize()
            .map_err(|_| "JSONファイルを確認できませんでした。")?;
        let project = read_project(&path)?;
        let saved = session.register(path);
        Ok(Some(OpenedProject {
            project,
            file_id: saved.file_id,
            display_name: saved.display_name,
        }))
    })
    .await
    .map_err(|_| "ファイル操作を完了できませんでした。")?
}

#[tauri::command]
pub async fn save_project(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project: serde_json::Value,
    file_id: Option<String>,
    save_as: bool,
) -> Result<Option<SavedProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = parse_project(
            &serde_json::to_vec(&project).map_err(|_| "JSONを確認できませんでした。")?,
        )?;
        let state = app.state::<ProjectFiles>();
        let mut session = state
            .0
            .try_lock()
            .map_err(|_| "別のファイル操作が進行中です。")?;
        let path = if save_as || file_id.is_none() {
            let Some(mut path) = select_project_path(&app, &window, true)? else {
                return Ok(None);
            };
            if !path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
            {
                return Err("保存先のファイル名は.jsonで終えてください。".into());
            }
            if path.exists() {
                path = path
                    .canonicalize()
                    .map_err(|_| "保存先を確認できませんでした。")?;
            }
            path
        } else {
            session.target(file_id.as_deref().unwrap())?
        };
        write_project(&path, &project)?;
        Ok(Some(session.register(path)))
    })
    .await
    .map_err(|_| "ファイル操作を完了できませんでした。")?
}
