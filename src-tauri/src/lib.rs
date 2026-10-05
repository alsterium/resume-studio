#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "desktop-e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .manage(compiler::results::PdfStore::default())
        .invoke_handler(tauri::generate_handler![
            commands::diagnose_tex,
            commands::generate_draft,
            commands::read_pdf
        ])
        .run(tauri::generate_context!())
        .expect("Resume Studioの起動に失敗しました");
}
pub mod commands;
pub mod compiler;
pub mod generator;
