//! Native WebView smoke test of the bundled React UI and real TeX IPC.
//! Run after `pnpm build`; this example is not shipped in the application.
use resume_studio_lib::{commands, compiler::results::PdfStore};
use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    let probe = std::env::var("RESUME_STUDIO_PROBE").unwrap_or_default();
    let script = match probe.as_str() {
        "preview" => include_str!("gui_preview.js"),
        "editor" => include_str!("gui_editor.js"),
        _ => include_str!("gui_diagnostics.js"),
    };
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .manage(PdfStore::default())
        .invoke_handler(tauri::generate_handler![
            commands::diagnose_tex,
            commands::generate_draft,
            commands::read_pdf
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let navigation_handle = handle.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Resume Studio — 診断検証")
                .inner_size(1200.0, 800.0)
                .on_navigation(move |url| {
                    // Intercept the sentinel locally; no request reaches this host.
                    if url.host_str() == Some("diagnostic-probe.invalid") {
                        let success = url.path() == "/success";
                        if !success {
                            eprintln!("PROBE_FAILURE: {}", url.query().unwrap_or_default());
                        }
                        println!("GUI_DIAGNOSTICS: {}", if success { "PASS" } else { "FAIL" });
                        navigation_handle.exit(if success { 0 } else { 1 });
                        return false;
                    }
                    true
                })
                .on_page_load(move |window, payload| {
                    if payload.event() != tauri::webview::PageLoadEvent::Finished {
                        return;
                    }
                    window.eval(script).expect("probe script");
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
