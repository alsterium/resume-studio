//! Native WebView smoke test of the bundled React UI and real TeX IPC.
//! Run after `pnpm build`; this example is not shipped in the application.
use resume_studio_lib::{commands, compiler::results::PdfStore};
use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    let preview = std::env::var("RESUME_STUDIO_PROBE").as_deref() == Ok("preview");
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
                    window
                        .eval(if preview {
                            include_str!("gui_preview.js")
                        } else {
                            include_str!("gui_diagnostics.js")
                        })
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
