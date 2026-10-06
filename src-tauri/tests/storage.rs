use resume_studio_lib::{
    domain::validation::{encode_project, parse_project, MAX_PROJECT_BYTES},
    storage::{read_project, write_project, write_project_with_commit, CommitFile},
};
use std::{fs, io, path::Path};
use tempfile::{tempdir, NamedTempFile};

struct FailCommit;
impl CommitFile for FailCommit {
    fn commit(&self, file: NamedTempFile, _path: &Path) -> io::Result<()> {
        assert!(
            !fs::read(file.path()).unwrap().is_empty(),
            "Real temporary write must finish before failure"
        );
        Err(io::Error::other("injected replacement failure"))
    }
}
fn sample() -> resume_studio_lib::domain::project::Project {
    parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap()
}

#[test]
fn real_json_roundtrip_overwrite_and_move_preserve_the_project() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("架空の応募 書類.json");
    let mut project = sample();
    write_project(&path, &project).unwrap();
    assert_eq!(
        encode_project(&read_project(&path).unwrap()).unwrap(),
        encode_project(&project).unwrap()
    );
    project.profile.name = "架空 更新名".into();
    write_project(&path, &project).unwrap();
    let moved = dir.path().join("移動後.json");
    fs::rename(&path, &moved).unwrap();
    assert_eq!(read_project(&moved).unwrap().profile.name, "架空 更新名");
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn failures_preserve_existing_bytes_and_remove_temporary_files() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("原本.json");
    write_project(&path, &sample()).unwrap();
    let original = fs::read(&path).unwrap();
    let mut changed = sample();
    changed.title = "更新".into();
    assert!(write_project_with_commit(&path, &changed, &FailCommit).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    changed.schema_version = 2;
    assert!(write_project(&path, &changed).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    assert!(write_project(&dir.path().join("不存在/書類.json"), &sample()).is_err());
    assert!(write_project(dir.path(), &sample()).is_err());
}

#[test]
fn malformed_unsupported_and_oversized_files_are_read_only_errors() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("破損.json");
    for bytes in [
        b"{".to_vec(),
        include_bytes!("../../tests/fixtures/project-empty.json").to_vec(),
    ] {
        fs::write(&path, &bytes).unwrap();
        if bytes == b"{" {
            assert!(read_project(&path).is_err());
        }
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
    let mut value: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../tests/fixtures/project-empty.json")).unwrap();
    value["schemaVersion"] = serde_json::json!(2);
    let bytes = serde_json::to_vec(&value).unwrap();
    fs::write(&path, &bytes).unwrap();
    assert!(read_project(&path).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let file = fs::File::create(&path).unwrap();
    file.set_len((MAX_PROJECT_BYTES + 1) as u64).unwrap();
    assert!(read_project(&path).is_err());
    assert!(read_project(dir.path()).is_err());
}

#[cfg(unix)]
#[test]
fn readonly_files_are_preserved_and_permissions_survive_overwrite() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempdir().unwrap();
    let path = dir.path().join("権限.json");
    write_project(&path, &sample()).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    write_project(&path, &sample()).unwrap();
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o640
    );
    fs::set_permissions(&path, fs::Permissions::from_mode(0o440)).unwrap();
    let bytes = fs::read(&path).unwrap();
    assert!(write_project(&path, &sample()).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
}
