use resume_studio_lib::{
    compiler::{compile::compile, diagnostics::TexRuntime},
    generator::{generate, Draft},
};
use std::fs;

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
