#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::diagnose_tex])
        .run(tauri::generate_context!())
        .expect("Resume Studioの起動に失敗しました");
}
mod commands;
pub mod compiler;
