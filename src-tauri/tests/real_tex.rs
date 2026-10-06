use resume_studio_lib::{
    compiler::{compile::compile, diagnostics::TexRuntime},
    generator::{generate, Draft},
};
use std::fs;

#[test]
fn formal_documents_compile_from_exported_bundles_with_and_without_photos() {
    use resume_studio_lib::{
        domain::validation::parse_project,
        generator::{bundle::write_bundle, documents::generate_project, templates::DocumentKind},
    };
    for fixture in [
        include_bytes!("../../tests/fixtures/project-full.json").as_slice(),
        include_bytes!("../../tests/fixtures/project-empty.json").as_slice(),
    ] {
        let project = parse_project(fixture).unwrap();
        for kind in [DocumentKind::Resume, DocumentKind::Career] {
            let bundle = generate_project(&project, kind).unwrap();
            let artifact =
                compile(&TexRuntime::discover(), &bundle).expect("formal document compilation");
            assert!(
                !artifact.log.contains("Missing character:"),
                "{}",
                artifact.log
            );
            let directory = tempfile::tempdir().unwrap();
            write_bundle(directory.path(), &bundle).unwrap();
            let runtime = TexRuntime::discover();
            let tool_directory = runtime.lualatex.as_ref().unwrap().parent().unwrap();
            // latexmk launches lualatex by name. Exercise a GUI-like minimal PATH,
            // adding only the discovered TeX directory rather than relying on a login shell.
            let tool_path = std::env::join_paths([
                tool_directory,
                std::path::Path::new("/usr/bin"),
                std::path::Path::new("/bin"),
            ])
            .unwrap();
            let output = std::process::Command::new(runtime.latexmk.as_ref().unwrap())
                .env("PATH", tool_path)
                .current_dir(directory.path())
                .args([
                    "-norc",
                    "-lualatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-latexoption=-no-shell-escape",
                    "main.tex",
                ])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "stdout: {}\nstderr: {}\nTeX log: {}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr),
                fs::read_to_string(directory.path().join("main.log")).unwrap_or_default()
            );
            assert!(fs::read(directory.path().join("main.pdf"))
                .unwrap()
                .starts_with(b"%PDF-"));
            #[cfg(target_os = "macos")]
            {
                let text = extracted_pdf_text(&artifact.bytes);
                assert!(
                    text.split_whitespace().collect::<String>().contains(
                        if kind == DocumentKind::Resume {
                            "履歴書"
                        } else {
                            "職務経歴書"
                        }
                    ),
                    "{text}"
                );
                if !project.profile.name.is_empty() {
                    for value in [
                        project.profile.name.as_str(),
                        "架空資格",
                        "太字の日本語 & %",
                        "番号付きの実績",
                    ] {
                        assert!(text.contains(value), "missing {value}: {text}");
                    }
                    if kind == DocumentKind::Career {
                        assert!(
                            text.contains("https://example.com/project?a=1&b=2"),
                            "{text}"
                        );
                        assert!(text.contains("架空の実務経験"), "{text}");
                    }
                }
            }
        }
    }
}

#[test]
#[cfg(target_os = "macos")]
fn resume_form_keeps_two_base_pages_and_preserves_overflow_in_section_order() {
    use resume_studio_lib::{
        domain::validation::parse_project,
        generator::{documents::generate_project, templates::DocumentKind},
    };
    for source in [
        include_bytes!("../../tests/fixtures/project-empty.json").as_slice(),
        include_bytes!("../../tests/fixtures/project-full.json").as_slice(),
    ] {
        let project = parse_project(source).unwrap();
        let artifact = compile(
            &TexRuntime::discover(),
            &generate_project(&project, DocumentKind::Resume).unwrap(),
        )
        .unwrap();
        assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
        assert!(
            !artifact.log.contains("Missing character:"),
            "{}",
            artifact.log
        );
        let pages = inspected_pdf_pages(&artifact.bytes);
        assert_eq!(pages.len(), 2, "{pages:?}");
        assert!(pages[0]["text"].as_str().unwrap().contains("学歴・職歴"));
        for label in ["免許・資格", "志望動機", "本人希望欄"] {
            assert!(pages[1]["text"].as_str().unwrap().contains(label));
        }
        assert_a4(&pages);
    }

    let mut value: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/project-full.json")).unwrap();
    // A single row exceeds the first table region: it must split, rather than disappear
    // inside an indivisible tabular cell. All input remains below schema limits.
    value["resume"]["education"] = serde_json::json!([
        {"id":"long-education","yearMonth":"2012-03","text":"長い学校名と学習内容。".repeat(70)}
    ]);
    for (field, marker) in [
        ("employment", "HISTORYTAIL"),
        ("qualifications", "QUALTAIL"),
    ] {
        let rows: Vec<_> = (0..45)
            .map(|i| {
                serde_json::json!({
                    "id":format!("{field}-{i}"),"yearMonth":"2020-04",
                "text":if i == 44 { marker.into() } else { format!("架空の履歴内容（{field}{i:02}）") }
                })
            })
            .collect();
        value["resume"][field] = serde_json::json!(rows);
    }
    for (field, marker) in [
        ("motivation", "MOTIVATIONTAIL"),
        ("preferences", "PREFERENCETAIL"),
    ] {
        value["resume"][field] = serde_json::json!({"type":"doc","content":[
            {"type":"paragraph","content":[{"type":"text","text":
                format!("{}{marker}", "架空の長文を改ページして保持する。".repeat(140))}]}]});
    }
    value["profile"]["address"] =
        serde_json::json!(format!("{}住所末尾", "架空の長い住所".repeat(10)));
    let project = parse_project(&serde_json::to_vec(&value).unwrap()).unwrap();
    let artifact = compile(
        &TexRuntime::discover(),
        &generate_project(&project, DocumentKind::Resume).unwrap(),
    )
    .unwrap();
    assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
    assert!(
        !artifact.log.contains("Missing character:"),
        "{}",
        artifact.log
    );
    let pages = inspected_pdf_pages(&artifact.bytes);
    assert!(pages.len() > 2);
    assert_a4(&pages);
    for label in ["免許・資格", "志望動機", "本人希望欄"] {
        assert!(pages[1]["text"].as_str().unwrap().contains(label));
    }
    let joined: String = pages.iter().map(|p| p["text"].as_str().unwrap()).collect();
    let normalized = joined.split_whitespace().collect::<String>();
    assert!(
        joined
            .split_whitespace()
            .collect::<String>()
            .contains("住所末尾"),
        "{joined}"
    );
    let mut previous_page = 1;
    for marker in [
        "HISTORYTAIL",
        "QUALTAIL",
        "MOTIVATIONTAIL",
        "PREFERENCETAIL",
    ] {
        let index = pages
            .iter()
            .position(|p| {
                p["text"]
                    .as_str()
                    .unwrap()
                    .split_whitespace()
                    .collect::<String>()
                    .contains(marker)
            })
            .unwrap_or_else(|| panic!("missing {marker}: {joined}"));
        assert!(
            index > previous_page,
            "unexpected continuation order: {marker} on {index}"
        );
        if matches!(marker, "HISTORYTAIL" | "QUALTAIL") {
            assert!(pages[index]["text"].as_str().unwrap().contains("以上"));
        }
        previous_page = index;
    }
    // Reassemble split text without the repeated form headers. A sentence may
    // cross a page boundary, where page.string also inserts the next heading.
    assert!(normalized
        .replace("年月学歴・職歴（続き）", "")
        .contains(&"長い学校名と学習内容。".repeat(70)));
    for (title, marker) in [
        ("志望動機・特技・アピールポイントなど", "MOTIVATIONTAIL"),
        ("本人希望欄", "PREFERENCETAIL"),
    ] {
        let mut body = String::new();
        for page in &pages {
            let text = page["text"]
                .as_str()
                .unwrap()
                .split_whitespace()
                .collect::<String>();
            if let Some((_, content)) = text.split_once(title) {
                let content = content.strip_prefix("（続き）").unwrap_or(content);
                let content = if title != "本人希望欄" {
                    content.split("本人希望欄").next().unwrap()
                } else {
                    content
                };
                body.push_str(content);
            }
        }
        assert!(
            body.contains(&format!(
                "{}{marker}",
                "架空の長文を改ページして保持する。".repeat(140)
            )),
            "{body}"
        );
    }
    for field in ["employment", "qualifications"] {
        for i in 0..44 {
            let marker = format!("架空の履歴内容（{field}{i:02}）");
            assert_eq!(
                normalized.matches(&marker).count(),
                1,
                "missing or repeated {marker}"
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn inspected_pdf_pages(bytes: &[u8]) -> Vec<serde_json::Value> {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("resume.pdf");
    fs::write(&path, bytes).unwrap();
    let output = std::process::Command::new("/usr/bin/swift")
        .args([
            "-e",
            r#"
import Foundation
import PDFKit
let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
let pages = (0..<document.pageCount).map { index -> [String: Any] in
    let page = document.page(at: index)!
    let size = page.bounds(for: .mediaBox).size
    return ["text": page.string ?? "", "width": size.width, "height": size.height]
}
print(String(data: try! JSONSerialization.data(withJSONObject: pages), encoding: .utf8)!)
"#,
            &path.to_string_lossy(),
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[cfg(target_os = "macos")]
fn assert_a4(pages: &[serde_json::Value]) {
    for page in pages {
        assert!((page["width"].as_f64().unwrap() - 595.276).abs() < 0.1);
        assert!((page["height"].as_f64().unwrap() - 841.89).abs() < 0.1);
    }
}

#[cfg(target_os = "macos")]
fn extracted_pdf_text(bytes: &[u8]) -> String {
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("body.pdf");
    fs::write(&pdf, bytes).unwrap();
    let output = std::process::Command::new("/usr/bin/swift").args(["-e", "import Foundation; import PDFKit; print(PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!.string ?? \"\")", &pdf.to_string_lossy()]).output().unwrap();
    assert!(output.status.success());
    String::from_utf8(output.stdout).unwrap()
}

#[test]
fn complete_visitor_fixture_compiles_and_preserves_text_and_numbering() {
    let body =
        serde_json::from_str(include_str!("../../tests/fixtures/body-visitor.json")).unwrap();
    let bundle = generate(&Draft {
        name: "visitor fixture".into(),
        body: String::new(),
        rich_body: Some(body),
    })
    .unwrap();
    let artifact = compile(&TexRuntime::discover(), &bundle).expect("complete visitor fixture");
    assert!(
        !artifact.log.contains("Missing character:"),
        "{}",
        artifact.log
    );
    assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
    #[cfg(target_os = "macos")]
    {
        let text = extracted_pdf_text(&artifact.bytes);
        for expected in [
            "先頭",
            "両方の書式",
            "命令は文字列",
            "input",
            "private",
            "番号一",
            "混在箇条書き",
            "内側番号",
            "四段目",
            "独立番号",
            "末尾目印",
            "2.",
            "7.",
            "5.",
        ] {
            assert!(text.contains(expected), "missing {expected}: {text}");
        }
        assert!(text.find("番号一").unwrap() < text.find("内側番号").unwrap());
        assert!(text.find("四段目").unwrap() < text.find("末尾目印").unwrap());
    }
}

#[test]
fn leading_repeated_breaks_and_blank_paragraphs_compile_without_losing_tail() {
    let body = serde_json::json!({"type":"doc","content":[
        {"type":"paragraph","content":[{"type":"hardBreak"},{"type":"hardBreak"},{"type":"text","text":"先頭改行の本文"}]},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"hardBreak"}]},
        {"type":"paragraph","content":[{"type":"text","text":"ASCII paragraph"}]},
        {"type":"paragraph","content":[{"type":"text","text":"末尾の確認"},{"type":"hardBreak"}]}
    ]});
    let bundle = generate(&Draft {
        name: "改行検証".into(),
        body: String::new(),
        rich_body: Some(serde_json::from_value(body).unwrap()),
    })
    .unwrap();
    let artifact = compile(&TexRuntime::discover(), &bundle).expect("leading/blank breaks compile");
    assert!(
        !artifact.log.contains("Missing character:"),
        "{}",
        artifact.log
    );
    assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
    #[cfg(target_os = "macos")]
    {
        let text = extracted_pdf_text(&artifact.bytes);
        assert!(text.contains("先頭改行の本文"), "{text}");
        assert!(text.contains("ASCII paragraph"), "{text}");
        assert!(text.contains("末尾の確認"), "{text}");
    }
}

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
