use crate::{
    generator::{bundle::write_bundle, GeneratedBundle},
    storage::{AtomicCommit, CommitFile},
};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub fn write_pdf(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_pdf_with_commit(path, bytes, &AtomicCommit)
}

pub fn write_pdf_with_commit(
    path: &Path,
    bytes: &[u8],
    commit: &dyn CommitFile,
) -> Result<(), String> {
    if !bytes.starts_with(b"%PDF-") || bytes.len() > 20 * 1024 * 1024 {
        return Err("PDFの形式または容量を確認できませんでした。".into());
    }
    let permissions = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.permissions().readonly() => {
            Some(metadata.permissions())
        }
        Ok(_) => return Err("保存先が書込可能な通常ファイルではありません。".into()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(_) => return Err("保存先を確認できませんでした。".into()),
    };
    let mut temporary = tempfile::Builder::new()
        .prefix(".resume-studio-")
        .tempfile_in(path.parent().unwrap_or(Path::new(".")))
        .map_err(|_| "保存先に一時PDFを作れませんでした。")?;
    temporary
        .write_all(bytes)
        .map_err(|_| "PDFを書き込めませんでした。")?;
    if let Some(permissions) = permissions {
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|_| "保存先の権限を維持できませんでした。")?;
    }
    temporary
        .flush()
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| "PDFをディスクへ同期できませんでした。")?;
    commit
        .commit(temporary, path)
        .map_err(|_| "PDFの置換に失敗しました。元のファイルは維持されています。".into())
}

pub fn write_tex(path: &Path, bundle: &GeneratedBundle) -> Result<(), String> {
    write_tex_with_commit(path, bundle, &|from, to| fs::rename(from, to))
}

/// The replacement boundary is injectable after a real, complete bundle write.
pub fn write_tex_with_commit(
    path: &Path,
    bundle: &GeneratedBundle,
    commit: &dyn Fn(&Path, &Path) -> io::Result<()>,
) -> Result<(), String> {
    let existing = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.permissions().readonly() => {
            for entry in
                fs::read_dir(path).map_err(|_| "既存TeXフォルダを確認できませんでした。")?
            {
                let entry = entry.map_err(|_| "既存TeX資源を確認できませんでした。")?;
                let metadata = fs::symlink_metadata(entry.path())
                    .map_err(|_| "既存TeX資源を確認できませんでした。")?;
                let name = entry.file_name();
                let allowed = matches!(
                    name.to_str(),
                    Some(
                        "main.tex"
                            | "content.tex"
                            | "manifest.json"
                            | "resume.sty"
                            | "career.sty"
                            | "photo-1.jpg"
                            | "photo-2.jpg"
                            | "photo-3.jpg"
                            | "photo-4.jpg"
                            | "photo-1.png"
                            | "photo-2.png"
                            | "photo-3.png"
                            | "photo-4.png"
                    )
                );
                if !allowed || !metadata.is_file() || metadata.permissions().readonly() {
                    return Err("既存TeXフォルダに別の資源または書込不可のファイルがあります。別の保存先を選んでください。".into());
                }
            }
            true
        }
        Ok(_) => return Err("保存先が書込可能な通常フォルダではありません。".into()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(_) => return Err("保存先を確認できませんでした。".into()),
    };
    let parent = path.parent().unwrap_or(Path::new("."));
    let staging = tempfile::Builder::new()
        .prefix(".resume-studio-tex-")
        .tempdir_in(parent)
        .map_err(|_| "一時TeXフォルダを作れませんでした。")?;
    write_bundle(staging.path(), bundle).map_err(|_| "TeX一式を書き込めませんでした。")?;
    for entry in fs::read_dir(staging.path()).map_err(|_| "TeX資源を確認できませんでした。")?
    {
        fs::File::open(entry.map_err(|_| "TeX資源を確認できませんでした。")?.path())
            .and_then(|file| file.sync_all())
            .map_err(|_| "TeXをディスクへ同期できませんでした。")?;
    }
    let backup = tempfile::Builder::new()
        .prefix(".resume-studio-backup-")
        .tempdir_in(parent)
        .map_err(|_| "TeXの退避先を作れませんでした。")?;
    let previous = backup.path().join("previous");
    if existing {
        fs::rename(path, &previous)
            .map_err(|_| "既存TeXを退避できませんでした。原本を維持しています。")?;
    }
    if commit(staging.path(), path).is_err() {
        if existing && fs::rename(&previous, path).is_err() {
            let retained = backup.keep();
            return Err(format!(
                "TeXの置換と復元に失敗しました。元の資源は {} に保持されています。",
                retained.join("previous").display()
            ));
        }
        return Err("TeXの置換に失敗しました。元の資源は維持されています。".into());
    }
    Ok(())
}
