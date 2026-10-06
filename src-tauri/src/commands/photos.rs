use crate::storage::photos::{import_photo as import_file, ImportedPhoto};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn import_photo(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<ImportedPhoto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "desktop-e2e")]
        if let Some(path) = std::env::var_os("RESUME_STUDIO_E2E_PHOTO") {
            return import_file(std::path::Path::new(&path)).map(Some);
        }
        let Some(file) = app
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("JPEG / PNG", &["jpg", "jpeg", "png"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file
            .into_path()
            .map_err(|_| "通常の写真ファイルを選択してください。")?;
        import_file(&path).map(Some)
    })
    .await
    .map_err(|_| "写真の取り込みを完了できませんでした。")?
}
