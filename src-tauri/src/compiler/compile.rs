use super::{
    cancellation::{Cancellation, CANCELLED},
    diagnostics::{DiagnosticFailure, TexRuntime},
    process::run_cancellable,
};
use crate::generator::GeneratedBundle;
use std::{fs, time::Duration};

pub struct PdfArtifact {
    pub bytes: Vec<u8>,
    pub log: String,
}

pub fn compile(
    runtime: &TexRuntime,
    bundle: &GeneratedBundle,
) -> Result<PdfArtifact, DiagnosticFailure> {
    compile_with_control(
        runtime,
        bundle,
        &Cancellation::default(),
        Duration::from_secs(60),
    )
}

pub fn compile_with_control(
    runtime: &TexRuntime,
    bundle: &GeneratedBundle,
    cancellation: &Cancellation,
    timeout: Duration,
) -> Result<PdfArtifact, DiagnosticFailure> {
    let cancelled = || DiagnosticFailure {
        code: "CANCELED".into(),
        message: CANCELLED.into(),
        log: String::new(),
    };
    if cancellation.is_cancelled() {
        return Err(cancelled());
    }
    let io_error = |err: std::io::Error| DiagnosticFailure {
        code: "IO_ERROR".into(),
        message: "PDF生成用のファイルを準備できませんでした。".into(),
        log: err.to_string(),
    };
    let latexmk = runtime.latexmk.as_ref().ok_or_else(|| DiagnosticFailure {
        code: "TEX_NOT_FOUND".into(),
        message: "latexmkが見つかりません。".into(),
        log: String::new(),
    })?;
    let dir = tempfile::Builder::new()
        .prefix("resume-studio-compile-")
        .tempdir()
        .map_err(io_error)?;
    crate::generator::bundle::write_bundle(dir.path(), bundle).map_err(io_error)?;
    let mut command = runtime.command(latexmk);
    command.current_dir(dir.path()).args([
        "-norc",
        "-lualatex",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "-no-shell-escape",
        "main.tex",
    ]);
    let output = run_cancellable(command, timeout, cancellation).map_err(io_error)?;
    let log = format!("{}\n{}", output.stdout, output.stderr);
    if output.cancelled {
        return Err(cancelled());
    }
    if output.timed_out || !output.success {
        return Err(DiagnosticFailure {
            code: if output.timed_out {
                "TIMEOUT"
            } else {
                "COMPILE_FAILED"
            }
            .into(),
            message: "PDF生成に失敗しました。".into(),
            log,
        });
    }
    let path = dir.path().join("main.pdf");
    if fs::metadata(&path).map_err(io_error)?.len() > 20 * 1024 * 1024 {
        return Err(DiagnosticFailure {
            code: "OUTPUT_TOO_LARGE".into(),
            message: "生成PDFがサイズ上限を超えています。".into(),
            log,
        });
    }
    let bytes = fs::read(path).map_err(io_error)?;
    if !bytes.starts_with(b"%PDF-") {
        return Err(DiagnosticFailure {
            code: "COMPILE_FAILED".into(),
            message: "有効なPDFが生成されませんでした。".into(),
            log,
        });
    }
    if cancellation.is_cancelled() {
        return Err(cancelled());
    }
    Ok(PdfArtifact { bytes, log })
}
