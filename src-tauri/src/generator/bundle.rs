use super::GeneratedBundle;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::{self, Write},
    path::Path,
};

#[derive(Debug, Serialize)]
pub struct BundleResource {
    pub name: String,
    pub bytes: Vec<u8>,
}

pub fn write_bundle(directory: &Path, bundle: &GeneratedBundle) -> io::Result<()> {
    let mut files = vec![
        ("main.tex", bundle.main_tex.as_bytes()),
        ("content.tex", bundle.content_tex.as_bytes()),
    ];
    let mut names = HashSet::from(["main.tex", "content.tex"]);
    for resource in &bundle.resources {
        if !matches!(
            resource.name.as_str(),
            "resume.sty"
                | "career.sty"
                | "manifest.json"
                | "photo-1.jpg"
                | "photo-2.jpg"
                | "photo-3.jpg"
                | "photo-4.jpg"
                | "photo-1.png"
                | "photo-2.png"
                | "photo-3.png"
                | "photo-4.png"
        ) || !names.insert(&resource.name)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "生成資源名が不正または重複しています。",
            ));
        }
        files.push((&resource.name, &resource.bytes));
    }
    // Callers own a new staging directory. Check all names before writing any resource.
    for (name, _) in &files {
        match std::fs::symlink_metadata(directory.join(name)) {
            Ok(_) => {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "生成先のファイルが既に存在します。",
                ))
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    for (name, bytes) in files {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(directory.join(name))?;
        file.write_all(bytes)?;
    }
    Ok(())
}
