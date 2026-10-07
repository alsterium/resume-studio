use resume_studio_lib::{
    commands::exports::{export_to_directory, ExportStatus, OutputFormat},
    domain::validation::parse_project,
    generator::{documents::generate_project, templates::DocumentKind},
    storage::{
        outputs::{write_pdf, write_pdf_with_commit, write_tex, write_tex_with_commit},
        CommitFile,
    },
};
use std::{fs, io, path::Path};
use tempfile::{tempdir, NamedTempFile};
struct FailCommit;
impl CommitFile for FailCommit {
    fn commit(&self, file: NamedTempFile, _: &Path) -> io::Result<()> {
        assert!(fs::read(file.path()).unwrap().starts_with(b"%PDF-"));
        Err(io::Error::other("injected"))
    }
}
fn sample() -> resume_studio_lib::domain::project::Project {
    parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap()
}
#[test]
fn pdf_replacement_is_atomic_and_failed_writes_preserve_originals() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("応募 書類.pdf");
    write_pdf(&path, b"%PDF-original").unwrap();
    assert!(write_pdf_with_commit(&path, b"%PDF-changed", &FailCommit).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"%PDF-original");
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    for bytes in [&b"invalid"[..], &b"%PDF-changed"[..]] {
        if bytes.starts_with(b"%PDF-") {
            write_pdf(&path, bytes).unwrap();
        } else {
            assert!(write_pdf(&path, bytes).is_err());
        }
    }
    assert_eq!(fs::read(&path).unwrap(), b"%PDF-changed");
    assert!(write_pdf(dir.path(), b"%PDF-").is_err());
}
#[test]
fn tex_bundles_include_photo_and_manifest_and_rollback_the_whole_directory() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("履歴書-tex");
    let mut project = sample();
    let original = generate_project(&project, DocumentKind::Resume).unwrap();
    write_tex(&path, &original).unwrap();
    let before = fs::read(path.join("content.tex")).unwrap();
    assert!(path.join("photo-1.png").exists());
    assert!(path.join("manifest.json").exists());
    project.profile.name = "架空 更新名".into();
    project.profile.photo_asset_id = None;
    let changed = generate_project(&project, DocumentKind::Resume).unwrap();
    assert!(write_tex_with_commit(&path, &changed, &|from, _| {
        assert!(fs::read_to_string(from.join("content.tex"))
            .unwrap()
            .contains("架空 更新名"));
        Err(io::Error::other("injected"))
    })
    .is_err());
    assert_eq!(fs::read(path.join("content.tex")).unwrap(), before);
    assert!(path.join("photo-1.png").exists());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    write_tex(&path, &changed).unwrap();
    assert!(!path.join("photo-1.png").exists());
    assert!(fs::read_to_string(path.join("content.tex"))
        .unwrap()
        .contains("架空 更新名"));
    fs::write(path.join("手書きメモ.txt"), "残す").unwrap();
    assert!(write_tex(&path, &original).is_err());
    assert_eq!(
        fs::read_to_string(path.join("手書きメモ.txt")).unwrap(),
        "残す"
    );
}
#[test]
fn both_tex_exports_need_no_runtime_and_report_partial_failure_and_overwrite_decisions() {
    let dir = tempdir().unwrap();
    let mut project = sample();
    let kinds = [DocumentKind::Resume, DocumentKind::Career];
    let results = export_to_directory(
        &project,
        &kinds,
        OutputFormat::Tex,
        dir.path(),
        &|_| panic!("new output must not confirm"),
        &|_| {},
    );
    assert!(results
        .iter()
        .all(|result| matches!(result.status, ExportStatus::Saved)));
    for name in ["履歴書-tex", "職務経歴書-tex"] {
        assert!(dir.path().join(name).join("main.tex").exists());
    }
    let before = fs::read(dir.path().join("履歴書-tex/content.tex")).unwrap();
    project.templates.career.id = "unsupported-template".into();
    project.profile.name = "架空 更新名".into();
    let results = export_to_directory(
        &project,
        &kinds,
        OutputFormat::Tex,
        dir.path(),
        &|_| false,
        &|_| {},
    );
    assert!(results
        .iter()
        .all(|result| matches!(result.status, ExportStatus::Skipped)));
    assert_eq!(
        fs::read(dir.path().join("履歴書-tex/content.tex")).unwrap(),
        before
    );
    let results = export_to_directory(
        &project,
        &kinds,
        OutputFormat::Tex,
        dir.path(),
        &|_| true,
        &|_| {},
    );
    assert!(matches!(results[0].status, ExportStatus::Saved));
    assert!(matches!(results[1].status, ExportStatus::Failed));
    assert!(results[1]
        .error
        .as_ref()
        .unwrap()
        .contains("TEMPLATE_NOT_FOUND"));
    assert!(
        fs::read_to_string(dir.path().join("履歴書-tex/content.tex"))
            .unwrap()
            .contains("架空 更新名")
    );
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
}
#[cfg(unix)]
#[test]
fn exports_reject_symlinks_and_readonly_targets_without_touching_originals() {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let dir = tempdir().unwrap();
    let original = dir.path().join("原本.pdf");
    fs::write(&original, b"%PDF-original").unwrap();
    let link = dir.path().join("link.pdf");
    symlink(&original, &link).unwrap();
    assert!(write_pdf(&link, b"%PDF-new").is_err());
    fs::set_permissions(&original, fs::Permissions::from_mode(0o440)).unwrap();
    assert!(write_pdf(&original, b"%PDF-new").is_err());
    assert_eq!(fs::read(&original).unwrap(), b"%PDF-original");
    let folder = dir.path().join("bundle");
    fs::create_dir(&folder).unwrap();
    symlink(&original, folder.join("main.tex")).unwrap();
    let bundle = generate_project(&sample(), DocumentKind::Resume).unwrap();
    assert!(write_tex(&folder, &bundle).is_err());
    assert!(folder.join("main.tex").is_symlink());
}

#[test]
fn rollback_failure_retains_the_original_bundle_and_reports_its_location() {
    let directory = tempdir().unwrap();
    let target = directory.path().join("履歴書-tex");
    let bundle = generate_project(&sample(), DocumentKind::Resume).unwrap();
    write_tex(&target, &bundle).unwrap();
    let before = fs::read(target.join("content.tex")).unwrap();
    let error = write_tex_with_commit(&target, &bundle, &|_, path| {
        // Simulate another process occupying the target between retire and publish.
        fs::create_dir(path)?;
        fs::write(path.join("別のアプリの資源.txt"), b"keep")?;
        Err(io::Error::other(
            "injected replacement and rollback failure",
        ))
    })
    .unwrap_err();
    let backup = fs::read_dir(directory.path())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with(".resume-studio-backup-")
        })
        .unwrap();
    assert_eq!(
        fs::read(backup.join("previous/content.tex")).unwrap(),
        before
    );
    assert!(error.contains(&backup.join("previous").display().to_string()));
    assert_eq!(
        fs::read(target.join("別のアプリの資源.txt")).unwrap(),
        b"keep"
    );
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
}
