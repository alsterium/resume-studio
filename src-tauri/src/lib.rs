#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "desktop-e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::files::ProjectFiles::default())
        .manage(compiler::results::PdfStore::default())
        .invoke_handler(tauri::generate_handler![
            commands::diagnose_tex,
            commands::generate_draft,
            commands::read_pdf,
            commands::files::open_project,
            commands::files::save_project
        ])
        .run(tauri::generate_context!())
        .expect("Resume Studioの起動に失敗しました");
}
pub mod commands;
pub mod compiler;
pub mod domain;
pub mod generator;
pub mod storage;
