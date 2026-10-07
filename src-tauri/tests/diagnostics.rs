#![cfg(unix)]

use resume_studio_lib::compiler::diagnostics::{diagnose, TexRuntime};
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

fn script(dir: &Path, name: &str, body: &str) {
    let path = dir.join(name);
    fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
}

fn runtime(dir: &Path, compiler: &str, lookup: &str) -> TexRuntime {
    script(dir, "latexmk", compiler);
    script(dir, "lualatex", "echo 'LuaHBTeX fixture'");
    script(dir, "kpsewhich", lookup);
    TexRuntime::discover_in(&[dir.to_path_buf()])
}

#[test]
fn reports_missing_tools_without_compiling() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("latexmk"), "not executable").unwrap();
    let report = diagnose(&TexRuntime::discover_in(&[dir.path().to_path_buf()]));
    assert!(!report.pdf_validated);
    assert_eq!(
        report.missing_dependencies,
        ["latexmk", "lualatex", "kpsewhich"]
    );
    assert_eq!(report.error.unwrap().code, "TEX_NOT_FOUND");
}

#[test]
fn discovers_executables_in_paths_with_japanese_and_spaces() {
    let root = tempfile::tempdir().unwrap();
    let dir = root.path().join("架空 TeX bin");
    fs::create_dir(&dir).unwrap();
    let runtime = runtime(
        &dir,
        "echo latexmk",
        "if [ \"$1\" = --version ]; then echo kpsewhich; else exit 1; fi",
    );
    assert_eq!(
        runtime.lualatex.as_deref(),
        Some(dir.join("lualatex").as_path())
    );
    let report = diagnose(&runtime);
    assert_eq!(report.error.unwrap().code, "TEX_DEPENDENCY_MISSING");
    assert_eq!(report.missing_dependencies.len(), 11);
    for template in resume_studio_lib::generator::templates::bundled_templates() {
        for package in template.manifest.packages {
            assert!(
                report
                    .missing_dependencies
                    .contains(&format!("{package}.sty")),
                "template dependency is not diagnosed: {package}"
            );
        }
    }
}

#[test]
fn validates_pdf_in_isolated_directory_and_cleans_up() {
    let dir = tempfile::tempdir().unwrap();
    let output = dir.path().join("cwd.txt");
    let compiler = format!("if [ \"$1\" = --version ]; then echo latexmk; exit 0; fi\npwd > '{}'\nprintf '%%PDF-1.7\\nfixture' > main.pdf", output.display());
    let runtime = runtime(dir.path(), &compiler, "echo fixture");
    let report = diagnose(&runtime);
    assert!(report.pdf_validated, "{report:?}");
    assert!(report.error.is_none());
    let cwd = fs::read_to_string(output).unwrap();
    assert_ne!(cwd.trim(), dir.path().to_string_lossy());
    assert!(!Path::new(cwd.trim()).exists());
}

#[test]
fn rejects_compiler_failure_and_invalid_pdf() {
    for body in ["echo 'failed' >&2; exit 1", "printf 'invalid' > main.pdf"] {
        let dir = tempfile::tempdir().unwrap();
        let compiler = format!("if [ \"$1\" = --version ]; then echo latexmk; exit 0; fi\n{body}");
        let report = diagnose(&runtime(dir.path(), &compiler, "echo fixture"));
        assert!(!report.pdf_validated);
        assert_eq!(report.error.unwrap().code, "COMPILE_FAILED");
    }
}

#[test]
fn missing_template_package_or_bold_font_is_identified_without_running_compilation() {
    for missing in ["graphicx.sty", "HaranoAjiGothic-Bold.otf"] {
        let dir = tempfile::tempdir().unwrap();
        let trace = dir.path().join("compile-started.txt");
        let compiler = format!(
            "if [ \"$1\" = --version ]; then echo latexmk; exit 0; fi\ntouch '{}'",
            trace.display()
        );
        let lookup = format!("if [ \"$1\" = '{missing}' ]; then exit 1; else echo fixture; fi");
        let report = diagnose(&runtime(dir.path(), &compiler, &lookup));
        assert_eq!(report.missing_dependencies, [missing]);
        assert_eq!(report.error.unwrap().code, "TEX_DEPENDENCY_MISSING");
        assert!(!trace.exists());
        assert!(!report.pdf_validated);
    }
}
