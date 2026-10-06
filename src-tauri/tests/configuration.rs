use std::{fs, path::Path};

use serde_json::Value;

#[test]
fn application_metadata_matches_frontend_and_cargo() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let config: tauri::Config =
        serde_json::from_str(&fs::read_to_string(root.join("tauri.conf.json")).unwrap()).unwrap();
    let package: Value =
        serde_json::from_str(&fs::read_to_string(root.join("../package.json")).unwrap()).unwrap();

    assert_eq!(config.version.as_deref(), Some(env!("CARGO_PKG_VERSION")));
    assert_eq!(package["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(config.app.windows.len(), 1);
    assert_eq!(config.app.windows[0].label, "main");
    assert_eq!(
        config.bundle.macos.minimum_system_version.as_deref(),
        Some("12.0")
    );
}

#[test]
fn main_window_only_has_declared_application_permissions() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let config: Value =
        serde_json::from_str(&fs::read_to_string(root.join("tauri.conf.json")).unwrap()).unwrap();
    let capability: Value =
        serde_json::from_str(&fs::read_to_string(root.join("capabilities/main.json")).unwrap())
            .unwrap();

    assert_eq!(
        config["app"]["security"]["capabilities"],
        serde_json::json!(["main"])
    );
    assert_eq!(capability["identifier"], "main");
    assert_eq!(capability["windows"], serde_json::json!(["main"]));
    assert_eq!(
        capability["permissions"],
        serde_json::json!([
            "core:app:allow-version",
            "allow-diagnose-tex",
            "allow-draft-preview",
            "allow-project-files"
        ])
    );
    assert!(capability.get("remote").is_none());
}
