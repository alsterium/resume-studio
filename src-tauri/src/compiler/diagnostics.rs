use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use super::process::run;
use serde::Serialize;

const DEPENDENCIES: &[&str] = &[
    "ltjsarticle.cls",
    "luatexja-preset.sty",
    "regexpatch.sty",
    "graphicx.sty",
    "geometry.sty",
    "hyperref.sty",
    "color.sty",
    "HaranoAjiMincho-Regular.otf",
    "HaranoAjiGothic-Medium.otf",
    "HaranoAjiGothic-Regular.otf",
    "HaranoAjiMincho-Bold.otf",
    "HaranoAjiGothic-Bold.otf",
];

#[derive(Debug, Clone, Default)]
pub struct TexRuntime {
    pub latexmk: Option<PathBuf>,
    pub lualatex: Option<PathBuf>,
    pub kpsewhich: Option<PathBuf>,
}

fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

impl TexRuntime {
    pub fn discover() -> Self {
        let mut dirs: Vec<PathBuf> = env::var_os("PATH")
            .map(|p| env::split_paths(&p).collect())
            .unwrap_or_default();
        #[cfg(target_os = "macos")]
        dirs.extend(
            [
                "/Library/TeX/texbin",
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/usr/bin",
            ]
            .map(PathBuf::from),
        );
        Self::discover_in(&dirs)
    }

    pub fn discover_in(dirs: &[PathBuf]) -> Self {
        let find = |name: &str| {
            dirs.iter()
                .map(|dir| dir.join(name))
                .find(|path| executable(path))
        };
        Self {
            latexmk: find("latexmk"),
            lualatex: find("lualatex"),
            kpsewhich: find("kpsewhich"),
        }
    }

    pub(super) fn command(&self, path: &Path) -> Command {
        let mut command = Command::new(path);
        let mut dirs: Vec<PathBuf> = [
            self.latexmk.as_ref(),
            self.lualatex.as_ref(),
            self.kpsewhich.as_ref(),
        ]
        .into_iter()
        .flatten()
        .filter_map(|p| p.parent().map(PathBuf::from))
        .collect();
        dirs.extend(
            env::var_os("PATH")
                .map(|p| env::split_paths(&p).collect::<Vec<_>>())
                .unwrap_or_default(),
        );
        #[cfg(unix)]
        dirs.extend([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]);
        if let Ok(path) = env::join_paths(dirs) {
            command.env("PATH", path);
        }
        command
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub name: String,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiagnosticFailure {
    pub code: String,
    pub message: String,
    pub log: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexDiagnostics {
    pub tools: Vec<ToolStatus>,
    pub missing_dependencies: Vec<String>,
    pub pdf_validated: bool,
    pub error: Option<DiagnosticFailure>,
}

impl TexDiagnostics {
    fn fail(&mut self, code: &str, message: &str, log: String) {
        self.error = Some(DiagnosticFailure {
            code: code.into(),
            message: message.into(),
            log,
        });
    }
}

pub fn diagnose(runtime: &TexRuntime) -> TexDiagnostics {
    let mut report = TexDiagnostics {
        tools: vec![],
        missing_dependencies: vec![],
        pdf_validated: false,
        error: None,
    };
    for (name, path) in [
        ("latexmk", &runtime.latexmk),
        ("lualatex", &runtime.lualatex),
        ("kpsewhich", &runtime.kpsewhich),
    ] {
        let version = path.as_ref().and_then(|path| {
            let mut cmd = runtime.command(path);
            cmd.arg("--version");
            run(cmd, Duration::from_secs(10))
                .ok()
                .filter(|out| out.success && !out.timed_out)
                .and_then(|out| {
                    out.stdout
                        .lines()
                        .find(|line| !line.trim().is_empty())
                        .map(str::to_owned)
                })
        });
        if path.is_none() || version.is_none() {
            report.missing_dependencies.push(name.into());
        }
        report.tools.push(ToolStatus {
            name: name.into(),
            path: path.as_ref().map(|p| p.to_string_lossy().into_owned()),
            version,
        });
    }
    if let Some(kpsewhich) = &runtime.kpsewhich {
        for dependency in DEPENDENCIES {
            let mut cmd = runtime.command(kpsewhich);
            cmd.arg(dependency);
            match run(cmd, Duration::from_secs(10)) {
                Ok(out) if out.success && !out.stdout.trim().is_empty() && !out.timed_out => {}
                _ => report.missing_dependencies.push((*dependency).into()),
            }
        }
    }
    if !report.missing_dependencies.is_empty() {
        let tool_missing = report
            .missing_dependencies
            .iter()
            .any(|name| ["latexmk", "lualatex", "kpsewhich"].contains(&name.as_str()));
        report.fail(
            if tool_missing {
                "TEX_NOT_FOUND"
            } else {
                "TEX_DEPENDENCY_MISSING"
            },
            "PDF生成に必要なTeX環境が不足しています。",
            String::new(),
        );
        return report;
    }
    let validate = || -> Result<(), DiagnosticFailure> {
        let io_error = |err: std::io::Error| DiagnosticFailure {
            code: "IO_ERROR".into(),
            message: "TeX検証用のファイルを準備できませんでした。".into(),
            log: err.to_string(),
        };
        let dir = tempfile::Builder::new()
            .prefix("resume-studio-diagnose-")
            .tempdir()
            .map_err(io_error)?;
        fs::write(dir.path().join("main.tex"), include_str!("diagnostic.tex")).map_err(io_error)?;
        let mut cmd = runtime.command(runtime.latexmk.as_ref().expect("checked latexmk"));
        cmd.current_dir(dir.path()).args([
            "-norc",
            "-lualatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            "-no-shell-escape",
            "main.tex",
        ]);
        let out = run(cmd, Duration::from_secs(60)).map_err(io_error)?;
        let log = format!("{}\n{}", out.stdout, out.stderr);
        if out.timed_out || !out.success {
            return Err(DiagnosticFailure {
                code: if out.timed_out {
                    "TIMEOUT"
                } else {
                    "COMPILE_FAILED"
                }
                .into(),
                message: "日本語PDFの検証に失敗しました。".into(),
                log,
            });
        }
        let bytes = fs::read(dir.path().join("main.pdf")).map_err(io_error)?;
        if !bytes.starts_with(b"%PDF-") {
            return Err(DiagnosticFailure {
                code: "COMPILE_FAILED".into(),
                message: "有効なPDFが生成されませんでした。".into(),
                log,
            });
        }
        Ok(())
    };
    match validate() {
        Ok(()) => report.pdf_validated = true,
        Err(error) => report.error = Some(error),
    }
    report
}
