fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["diagnose_tex", "generate_draft", "read_pdf"]),
    ))
    .expect("Tauri権限定義の生成に失敗しました");
}
