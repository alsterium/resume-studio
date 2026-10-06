#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    let builder = tauri::Builder::default();
    #[cfg(feature = "desktop-e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::files::ProjectFiles::default())
        .manage(commands::close::CloseGuard::default())
        .manage(compiler::results::PdfStore::default())
        .invoke_handler(tauri::generate_handler![
            commands::diagnose_tex,
            commands::generate_draft,
            commands::documents::generate_document,
            commands::documents::list_templates,
            commands::read_pdf,
            commands::files::open_project,
            commands::files::save_project,
            commands::photos::import_photo,
            commands::close::request_app_close,
            commands::close::finish_app_close
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !window.state::<commands::close::CloseGuard>().permitted() {
                    api.prevent_close();
                    commands::close::notify_close(window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Resume Studioの起動に失敗しました")
        .run(|app, event| {
            #[cfg(all(target_os = "macos", feature = "desktop-e2e"))]
            if matches!(event, tauri::RunEvent::Ready) {
                app.show().expect("E2Eアプリを表示できませんでした");
                app.get_webview_window("main")
                    .expect("E2Eメインウィンドウ")
                    .set_focus()
                    .expect("E2Eウィンドウをフォーカスできませんでした");
            }
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<commands::close::CloseGuard>().permitted() {
                    api.prevent_exit();
                    commands::close::notify_close(app);
                }
            }
        });
}
pub mod commands;
pub mod compiler;
pub mod domain;
pub mod generator;
pub mod storage;
