use resume_studio_lib::{
    compiler::{compile::compile, diagnostics::TexRuntime},
    generator::{generate, Draft},
};

#[test]
fn fixture_renders_to_standalone_bundled_tex() {
    let draft: Draft =
        serde_json::from_str(include_str!("../../tests/fixtures/japanese-content.json")).unwrap();
    let bundle = generate(&draft).unwrap();
    assert!(bundle.main_tex.contains("\\input{content.tex}"));
    assert!(bundle.content_tex.starts_with("\\section*{山田 太郎}"));
    assert!(bundle.content_tex.contains("\\& \\% \\_ \\# \\$ \\{ \\}"));
    assert!(bundle
        .content_tex
        .contains("改行後の内容も保存します。\\par"));
    let error = compile(&TexRuntime::default(), &bundle).err().unwrap();
    assert_eq!(error.code, "TEX_NOT_FOUND");
}
