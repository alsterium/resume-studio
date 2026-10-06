use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct CloseGuard(AtomicBool);

impl CloseGuard {
    pub fn permitted(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

pub fn notify_close(app: &tauri::AppHandle) {
    let _ = app.emit_to("main", "resume-studio:request-close", ());
}

#[tauri::command]
pub fn request_app_close(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    quit: bool,
) -> Result<(), String> {
    if quit {
        app.exit(0);
        Ok(())
    } else {
        window
            .close()
            .map_err(|_| "終了を要求できませんでした。".into())
    }
}

#[tauri::command]
pub fn finish_app_close(app: tauri::AppHandle) {
    app.state::<CloseGuard>().0.store(true, Ordering::SeqCst);
    app.exit(0);
}
