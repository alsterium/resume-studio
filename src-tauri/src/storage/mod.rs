use crate::domain::{
    project::Project,
    validation::{encode_project, parse_project, MAX_PROJECT_BYTES},
};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::Path,
};
use tempfile::NamedTempFile;
pub mod outputs;
pub mod photos;

/// Boundary for injecting a replacement failure after a real temporary write.
pub trait CommitFile {
    fn commit(&self, file: NamedTempFile, path: &Path) -> io::Result<()>;
}
pub struct AtomicCommit;
impl CommitFile for AtomicCommit {
    fn commit(&self, file: NamedTempFile, path: &Path) -> io::Result<()> {
        file.persist(path).map(|_| ()).map_err(|error| error.error)
    }
}

pub fn read_project(path: &Path) -> Result<Project, String> {
    let file = File::open(path).map_err(|_| "JSONファイルを開けませんでした。")?;
    let metadata = file
        .metadata()
        .map_err(|_| "JSONファイルを確認できませんでした。")?;
    if !metadata.is_file() {
        return Err("通常のJSONファイルを選択してください。".into());
    }
    if metadata.len() > MAX_PROJECT_BYTES as u64 {
        return Err("JSONは20MiB以内にしてください。".into());
    }
    let mut bytes = Vec::new();
    file.take((MAX_PROJECT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "JSONファイルを読み込めませんでした。")?;
    parse_project(&bytes)
}

pub fn write_project(path: &Path, project: &Project) -> Result<(), String> {
    write_project_with_commit(path, project, &AtomicCommit)
}

pub fn write_project_with_commit(
    path: &Path,
    project: &Project,
    commit: &dyn CommitFile,
) -> Result<(), String> {
    let bytes = encode_project(project)?;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let permissions = match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata.is_file() || metadata.permissions().readonly() {
                return Err("保存先が書込可能な通常ファイルではありません。".into());
            }
            Some(metadata.permissions())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(_) => return Err("保存先を確認できませんでした。".into()),
    };
    let mut file = tempfile::Builder::new()
        .prefix(".resume-studio-")
        .tempfile_in(parent)
        .map_err(|_| "保存先に一時ファイルを作れませんでした。")?;
    file.write_all(&bytes)
        .map_err(|_| "JSONの書き込みに失敗しました。")?;
    if let Some(permissions) = permissions {
        file.as_file()
            .set_permissions(permissions)
            .map_err(|_| "保存先の権限を維持できませんでした。")?;
    }
    file.flush()
        .map_err(|_| "JSONの書き込みを完了できませんでした。")?;
    file.as_file()
        .sync_all()
        .map_err(|_| "JSONをディスクへ同期できませんでした。")?;
    commit
        .commit(file, path)
        .map_err(|_| "JSONの置換に失敗しました。元のファイルは維持されています。".into())
}
