use resume_studio_lib::{
    compiler::{compile::compile, diagnostics::TexRuntime},
    generator::{generate, Draft},
};
use std::fs;

#[test]
fn rich_japanese_body_compiles_with_marks_breaks_and_nested_lists() {
    let draft = Draft {
        name: "架空 山田".into(),
        body: String::new(),
        rich_body: Some(
            serde_json::from_str(include_str!("../../tests/fixtures/rich-body.json")).unwrap(),
        ),
    };
    let bundle = generate(&draft).unwrap();
    let artifact =
        compile(&TexRuntime::discover(), &bundle).expect("real rich body TeX compilation");
    assert!(
        !artifact.log.contains("Missing character:"),
        "{}",
        artifact.log
    );
    assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
    #[cfg(target_os = "macos")]
    {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("rich.pdf");
        fs::write(&pdf, artifact.bytes).unwrap();
        let output = std::process::Command::new("/usr/bin/swift").args(["-e", "import Foundation; import PDFKit; print(PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!.string ?? \"\")", &pdf.to_string_lossy()]).output().unwrap();
        assert!(output.status.success());
        let text = String::from_utf8(output.stdout).unwrap();
        for expected in [
            "太字の日本語 & %",
            "斜体の本文",
            "箇条書きの業務",
            "番号付きの実績",
            "2.",
        ] {
            assert!(text.contains(expected), "missing {expected}: {text}");
        }
    }
}

#[test]
fn fictional_japanese_and_special_characters_compile_with_real_tex() {
    let draft: Draft =
        serde_json::from_str(include_str!("../../tests/fixtures/japanese-content.json")).unwrap();
    let bundle = generate(&draft).unwrap();
    let artifact =
        compile(&TexRuntime::discover(), &bundle).expect("real Japanese TeX compilation");
    assert!(artifact.bytes.len() > 1000);
    assert!(
        !artifact.log.contains("Missing character:"),
        "{}",
        artifact.log
    );
    assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("main.tex"), &bundle.main_tex).unwrap();
    fs::write(dir.path().join("content.tex"), &bundle.content_tex).unwrap();
    fs::write(dir.path().join("main.pdf"), &artifact.bytes).unwrap();
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/swift").args(["-e", "import Foundation; import PDFKit; let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!; print(document.string ?? \"\")", &dir.path().join("main.pdf").to_string_lossy()]).output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let text = String::from_utf8(output.stdout).unwrap();
        assert!(text.contains(&draft.name), "{text}");
        assert!(text.contains("架空の職務経歴です。"), "{text}");
        assert!(text.contains("改行後の内容も保存します。"), "{text}");
        for special in ["&", "%", "_", "#", "$", "{", "}", "~", "^", "\\"] {
            assert!(text.contains(special), "missing {special}: {text}");
        }
    }
}
