//! Native WebView smoke test of the bundled React UI and real TeX IPC.
//! Run after `pnpm build`; this example is not shipped in the application.
use resume_studio_lib::compiler::diagnostics::{diagnose, TexDiagnostics, TexRuntime};
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
async fn diagnose_tex() -> Result<TexDiagnostics, String> {
    tauri::async_runtime::spawn_blocking(|| diagnose(&TexRuntime::discover()))
        .await
        .map_err(|error| error.to_string())
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![diagnose_tex])
        .setup(|app| {
            let handle = app.handle().clone();
            let navigation_handle = handle.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Resume Studio — 診断検証")
                .inner_size(1200.0, 800.0)
                .on_navigation(move |url| {
                    // Intercept the sentinel locally; no request reaches this host.
                    if url.host_str() == Some("diagnostic-probe.invalid") {
                        let success = url.path() == "/success";
                        println!("GUI_DIAGNOSTICS: {}", if success { "PASS" } else { "FAIL" });
                        navigation_handle.exit(if success { 0 } else { 1 });
                        return false;
                    }
                    true
                })
                .on_page_load(|window, payload| {
                    if payload.event() != tauri::webview::PageLoadEvent::Finished {
                        return;
                    }
                    window
                        .eval(include_str!("gui_diagnostics.js"))
                        .expect("probe script");
                })
                .build()?;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(90));
                eprintln!("GUI_DIAGNOSTICS: TIMEOUT");
                handle.exit(1);
            });
            Ok(())
        })
        .run(context)
        .expect("native diagnostics probe");
}
