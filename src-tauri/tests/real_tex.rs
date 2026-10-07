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
        let mut project = parse_project(fixture).unwrap();
        project.templates.resume.version = "1.1.0".into();
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
                if kind == DocumentKind::Career {
                    let pages = inspected_pdf_pages(&artifact.bytes);
                    assert_eq!(
                        pages.len(),
                        1,
                        "normal/empty career must not add an empty page"
                    );
                    assert_a4(&pages);
                    assert!(!pages[0]["text"].as_str().unwrap().contains("自己PR"));
                }
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
        let mut project = parse_project(source).unwrap();
        project.templates.resume.version = "1.1.0".into();
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
        let bundle = generate_project(&project, DocumentKind::Resume).unwrap();
        save_layout_qa(
            if project.profile.name.is_empty() {
                "jis-empty"
            } else {
                "jis-full"
            },
            &bundle,
            &artifact.bytes,
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
    let mut project = parse_project(&serde_json::to_vec(&value).unwrap()).unwrap();
    project.templates.resume.version = "1.1.0".into();
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
    let urls = page.annotations.compactMap { ($0.action as? PDFActionURL)?.url?.absoluteString }
    let left = page.selection(for: CGRect(x: 0, y: 0, width: size.width / 2, height: size.height))?.string ?? ""
    let right = page.selection(for: CGRect(x: size.width / 2, y: 0, width: size.width / 2, height: size.height))?.string ?? ""
    return ["text": page.string ?? "", "leftText": left, "rightText": right, "width": size.width, "height": size.height, "urls": urls]
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

#[test]
#[cfg(target_os = "macos")]
fn maximum_fixed_fields_wrap_and_resume_moves_oversized_contacts_to_continuations() {
    use resume_studio_lib::{
        domain::validation::parse_project,
        generator::{documents::generate_project, templates::DocumentKind},
    };
    let mut value: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/project-full.json")).unwrap();
    let maximum = |marker: &str| {
        format!(
            "{marker}{}END{marker}",
            "W".repeat(1024 - marker.len() * 2 - 3)
        )
    };
    let mut resume_fields = Vec::new();
    for (i, key) in [
        "name",
        "nameKana",
        "postalCode",
        "address",
        "addressKana",
        "phone",
        "email",
        "genderLabel",
    ]
    .iter()
    .enumerate()
    {
        let text = maximum(&format!("PROFILE{i}"));
        value["profile"][key] = serde_json::json!(text);
        resume_fields.push(text);
    }
    for (i, key) in ["postalCode", "address", "addressKana", "phone", "email"]
        .iter()
        .enumerate()
    {
        let text = maximum(&format!("CONTACT{i}"));
        value["profile"]["alternateContact"][key] = serde_json::json!(text);
        resume_fields.push(text);
    }
    for (i, key) in ["education", "employment", "qualifications"]
        .iter()
        .enumerate()
    {
        let text = maximum(&format!("HISTORY{i}"));
        value["resume"][key][0]["text"] = serde_json::json!(text);
        resume_fields.push(text);
    }
    let mut career_fields = vec![
        resume_fields[0].clone(),
        resume_fields.last().unwrap().clone(),
    ];
    for (i, key) in ["name", "experienceLabel", "description"]
        .iter()
        .enumerate()
    {
        let text = maximum(&format!("SKILL{i}"));
        value["career"]["skills"][0][key] = serde_json::json!(text);
        career_fields.push(text);
    }
    // A long Japanese company name makes the gray heading tall as well.
    let company = format!("{}COMPANYTAIL", "架".repeat(1013));
    value["career"]["positions"][0]["companyName"] = serde_json::json!(company);
    career_fields.push(company);
    for (i, key) in ["business", "capital", "employees"].iter().enumerate() {
        let text = maximum(&format!("COMPANY{i}"));
        value["career"]["positions"][0]["companyOverview"][key] = serde_json::json!(text);
        career_fields.push(text);
    }
    let role = maximum("ROLE");
    value["career"]["positions"][0]["role"] = serde_json::json!(role);
    career_fields.push(role);
    for (i, key) in ["name", "teamSize"].iter().enumerate() {
        let text = maximum(&format!("PROJECT{i}"));
        value["career"]["positions"][0]["projects"][0][key] = serde_json::json!(text);
        career_fields.push(text);
    }
    for (i, key) in ["phases", "languages", "technologies"].iter().enumerate() {
        let text = maximum(&format!("ARRAY{i}"));
        value["career"]["positions"][0]["projects"][0][key] = serde_json::json!([text]);
        career_fields.push(text);
    }
    value["career"]["positions"][0]["projects"][0]["responsibilities"] = serde_json::json!({
        "type":"doc", "content":[{"type":"paragraph","content":(0..1024).map(|i|
            serde_json::json!({"type":"text","text":"W","marks":[{"type":if i%2==0 {"bold"} else {"italic"}}]})
        ).collect::<Vec<_>>()}]
    });
    career_fields.push("W".repeat(1024));
    let url_prefix = "https://example.com/";
    let url_tail = "?tail=ENDMAXURL";
    let url = format!(
        "{url_prefix}{}{url_tail}",
        "W".repeat(2048 - url_prefix.len() - url_tail.len())
    );
    assert_eq!(url.len(), 2048);
    value["career"]["positions"][0]["projects"][0]["url"] = serde_json::json!(url);
    career_fields.push(url);
    let mut project = parse_project(&serde_json::to_vec(&value).unwrap()).unwrap();
    project.templates.resume.version = "1.1.0".into();
    for (kind, fields) in [
        (DocumentKind::Resume, resume_fields),
        (DocumentKind::Career, career_fields),
    ] {
        let bundle = generate_project(&project, kind).unwrap();
        let artifact = compile(&TexRuntime::discover(), &bundle).unwrap();
        save_layout_qa(
            &format!("maximum-fields-{kind:?}"),
            &bundle,
            &artifact.bytes,
        );
        assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
        assert!(
            !artifact.log.contains("Missing character:"),
            "{}",
            artifact.log
        );
        let pages = inspected_pdf_pages(&artifact.bytes);
        assert_a4(&pages);
        let text = pages
            .iter()
            .map(|p| p["text"].as_str().unwrap())
            .collect::<String>()
            .split_whitespace()
            .collect::<String>()
            .replace("履歴書（続紙）2026年10月6日現在", "")
            .replace("基本情報・連絡先（続き）", "")
            .replace("年月学歴・職歴（続き）", "")
            .replace("年月免許・資格（続き）", "");
        for field in fields {
            // Base page 2 also contains qualifications and body frames. Remove
            // those unrelated regions before joining a history row across pages.
            let table_text = if kind == DocumentKind::Resume && field.starts_with("HISTORY") {
                let (title, next) = if field.starts_with("HISTORY2") {
                    ("免許・資格", "志望動機・特技・アピールポイントなど")
                } else {
                    ("学歴・職歴", "免許・資格")
                };
                pages
                    .iter()
                    .filter_map(|p| {
                        let page = p["text"]
                            .as_str()
                            .unwrap()
                            .split_whitespace()
                            .collect::<String>();
                        page.split_once(title).map(|(_, body)| {
                            body.strip_prefix("（続き）")
                                .unwrap_or(body)
                                .trim_start_matches("年月")
                                .split(next)
                                .next()
                                .unwrap()
                                .replace("年月", "")
                        })
                    })
                    .collect::<String>()
            } else if kind == DocumentKind::Career
                && (field.starts_with("SKILL") || field.starts_with("HISTORY2"))
            {
                // PDFKit interleaves the two skill cells in page.string. Read
                // each physical column separately to compare its full value.
                let column = if field.starts_with("SKILL2") {
                    "rightText"
                } else {
                    "leftText"
                };
                pages
                    .iter()
                    .map(|p| p[column].as_str().unwrap())
                    .collect::<String>()
                    .split_whitespace()
                    .collect::<String>()
            } else {
                text.clone()
            };
            if !table_text.contains(&field) {
                let marker: String = field.chars().take(8).collect();
                let actual = table_text
                    .split_once(&marker)
                    .map(|(_, rest)| format!("{marker}{rest}"))
                    .unwrap_or_default();
                let mismatch = field
                    .chars()
                    .zip(actual.chars())
                    .position(|(a, b)| a != b)
                    .unwrap_or(actual.chars().count());
                panic!(
                    "missing {marker}: mismatch at {mismatch}, nearby {}",
                    actual
                        .chars()
                        .skip(mismatch.saturating_sub(30))
                        .take(120)
                        .collect::<String>()
                );
            }
        }
        if kind == DocumentKind::Resume {
            assert!(pages.len() > 2);
            assert!(pages[0]["text"].as_str().unwrap().contains("続紙に全文"));
        }
    }
}

#[test]
#[cfg(target_os = "macos")]
fn maximum_body_bytes_preserve_the_complete_text_in_both_documents() {
    use resume_studio_lib::{
        domain::validation::parse_project,
        generator::{documents::generate_project, templates::DocumentKind},
    };
    for (name, text) in [
        ("japanese", format!("{}ENDMAXBODY", "境".repeat(21842))),
        (
            "ascii",
            format!("{}ENDMAXASCII", "W".repeat(65536 - "ENDMAXASCII".len())),
        ),
    ] {
        assert_eq!(text.len(), 65536);
        let mut value: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/project-empty.json")).unwrap();
        let body = serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});
        value["resume"]["motivation"] = body.clone();
        value["career"]["summary"] = body;
        let mut project = parse_project(&serde_json::to_vec(&value).unwrap()).unwrap();
        project.templates.resume.version = "1.1.0".into();
        for kind in [DocumentKind::Resume, DocumentKind::Career] {
            let bundle = generate_project(&project, kind).unwrap();
            let artifact = compile(&TexRuntime::discover(), &bundle).unwrap();
            save_layout_qa(
                &format!("maximum-body-{name}-{kind:?}"),
                &bundle,
                &artifact.bytes,
            );
            assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
            assert!(
                !artifact.log.contains("Missing character:"),
                "{}",
                artifact.log
            );
            let pages = inspected_pdf_pages(&artifact.bytes);
            assert_a4(&pages);
            assert!(pages.len() > 2);
            let mut extracted = String::new();
            for page in pages {
                let page_text = page["text"]
                    .as_str()
                    .unwrap()
                    .split_whitespace()
                    .collect::<String>();
                if kind == DocumentKind::Resume {
                    if let Some((_, body)) =
                        page_text.split_once("志望動機・特技・アピールポイントなど")
                    {
                        extracted.push_str(
                            body.strip_prefix("（続き）")
                                .unwrap_or(body)
                                .split("本人希望欄")
                                .next()
                                .unwrap(),
                        );
                    }
                } else {
                    extracted.push_str(&page_text);
                }
            }
            assert!(extracted.contains(&text), "maximum body lost text");
        }
    }
}

#[test]
#[cfg(target_os = "macos")]
fn real_photos_keep_their_aspect_ratio_inside_the_resume_frame() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
    use resume_studio_lib::{
        domain::{project::Asset, validation::parse_project},
        generator::{documents::generate_project, templates::DocumentKind},
    };
    use std::io::Cursor;
    for (width, height, format) in [
        (0, 0, ImageFormat::Png),
        (900, 1200, ImageFormat::Png),
        (900, 900, ImageFormat::Png),
        (900, 600, ImageFormat::Jpeg),
    ] {
        let mut project =
            parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
        project.templates.resume.version = "1.1.0".into();
        project.assets.clear();
        project.profile.photo_asset_id = None;
        if width > 0 {
            let picture = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
                width,
                height,
                Rgba([240, 30, 30, 180]),
            ));
            let picture = if format == ImageFormat::Jpeg {
                DynamicImage::ImageRgb8(picture.to_rgb8())
            } else {
                picture
            };
            let mut output = Cursor::new(Vec::new());
            picture.write_to(&mut output, format).unwrap();
            project.assets.push(Asset {
                id: "photo-shape".into(),
                media_type: if format == ImageFormat::Png {
                    "image/png"
                } else {
                    "image/jpeg"
                }
                .into(),
                base64: STANDARD.encode(output.into_inner()),
            });
            project.profile.photo_asset_id = Some("photo-shape".into());
        }
        let bundle = generate_project(&project, DocumentKind::Resume).unwrap();
        let artifact = compile(&TexRuntime::discover(), &bundle).unwrap();
        save_layout_qa(
            &format!("photo-{width}-{height}-{format:?}"),
            &bundle,
            &artifact.bytes,
        );
        assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
        assert!(
            !artifact.log.contains("Missing character:"),
            "{}",
            artifact.log
        );
        let pages = inspected_pdf_pages(&artifact.bytes);
        assert_eq!(pages.len(), 2);
        assert_a4(&pages);
        let bounds = photo_pixel_bounds(&artifact.bytes);
        if width == 0 {
            assert!(
                bounds.is_none(),
                "unselected photo must leave an empty frame"
            );
        } else {
            let [left, top, right, bottom] = bounds.unwrap();
            assert!(
                left >= 160.0 && right <= 194.0 && top >= 25.0 && bottom <= 85.0,
                "photo outside frame: {bounds:?}"
            );
            let expected_height = if height > width {
                39.9
            } else {
                30.0 * f64::from(height) / f64::from(width)
            };
            let expected_width = expected_height * f64::from(width) / f64::from(height);
            assert!(
                (right - left - expected_width).abs() < 0.6,
                "wrong photo width: {bounds:?}"
            );
            assert!(
                (bottom - top - expected_height).abs() < 0.6,
                "wrong photo height: {bounds:?}"
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn save_layout_qa(name: &str, bundle: &resume_studio_lib::generator::GeneratedBundle, pdf: &[u8]) {
    if let Some(root) = std::env::var_os("RESUME_STUDIO_PDF_QA_DIR") {
        let root = std::path::PathBuf::from(root);
        fs::create_dir_all(&root).unwrap();
        let directory = root.join(name);
        fs::create_dir(&directory)
            .expect("QA directory must be new; never overwrite earlier artifacts");
        resume_studio_lib::generator::bundle::write_bundle(&directory, bundle).unwrap();
        fs::write(directory.join("main.pdf"), pdf).unwrap();
    }
}

#[cfg(target_os = "macos")]
fn photo_pixel_bounds(bytes: &[u8]) -> Option<[f64; 4]> {
    let directory = tempfile::tempdir().unwrap();
    let pdf = directory.path().join("main.pdf");
    let png = directory.path().join("page.png");
    let script = directory.path().join("raster.swift");
    fs::write(&pdf, bytes).unwrap();
    fs::write(&script, r#"import Foundation
import PDFKit
import AppKit
let page = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!.page(at: 0)!
let size = page.bounds(for: .mediaBox).size
let image = page.thumbnail(of: NSSize(width: size.width * 1.5, height: size.height * 1.5), for: .mediaBox)
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
"#).unwrap();
    let output = std::process::Command::new("/usr/bin/swift")
        .arg(script)
        .arg(pdf)
        .arg(&png)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let image = image::open(png).unwrap().to_rgb8();
    let mut bounds = None;
    let scale = 210.0 / f64::from(image.width());
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[0] > 180
            && pixel[0].saturating_sub(pixel[1]) > 80
            && pixel[0].saturating_sub(pixel[2]) > 80
        {
            let point = [f64::from(x) * scale, f64::from(y) * scale];
            let rect = bounds.get_or_insert([point[0], point[1], point[0], point[1]]);
            rect[0] = rect[0].min(point[0]);
            rect[1] = rect[1].min(point[1]);
            rect[2] = rect[2].max(point[0]);
            rect[3] = rect[3].max(point[1]);
        }
    }
    bounds
}

#[test]
#[cfg(target_os = "macos")]
fn career_flow_preserves_long_cases_skill_cells_and_breakable_url_links() {
    use resume_studio_lib::{
        domain::validation::parse_project,
        generator::{documents::generate_project, templates::DocumentKind},
    };
    let mut value: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/project-full.json")).unwrap();
    let paragraph = |text: String| {
        serde_json::json!({"type":"doc","content":[
        {"type":"paragraph","content":[{"type":"text","text":text}]}]})
    };
    let responsibility = format!(
        "{}RESPONSIBILITYTAIL",
        "架空の長い業務内容を欠落なく表示する。".repeat(200)
    );
    let achievement = format!(
        "{}ACHIEVEMENTTAIL",
        "架空の実績を改ページして保持する。".repeat(160)
    );
    let promotion = format!(
        "{}SELFPRTAIL",
        "架空の自己PRを連続して保持する。".repeat(80)
    );
    let skill = format!(
        "{}SKILLTAIL",
        "架空のスキル経験を長文でも保持する。".repeat(30)
    );
    let url = format!(
        "https://example.com/{}?tail=URLTAIL",
        "verylongsegment".repeat(70)
    );
    value["career"]["positions"][0]["projects"][0]["responsibilities"] =
        paragraph(responsibility.clone());
    value["career"]["positions"][0]["projects"][0]["achievements"] = paragraph(achievement.clone());
    value["career"]["positions"][0]["projects"][0]["url"] = serde_json::json!(url);
    value["career"]["selfPromotion"] = paragraph(promotion.clone());
    value["career"]["skills"][0]["description"] = serde_json::json!(skill);
    let project = parse_project(&serde_json::to_vec(&value).unwrap()).unwrap();
    let bundle = generate_project(&project, DocumentKind::Career).unwrap();
    let artifact = compile(&TexRuntime::discover(), &bundle).unwrap();
    assert!(!artifact.log.contains("Overfull"), "{}", artifact.log);
    assert!(
        !artifact.log.contains("Missing character:"),
        "{}",
        artifact.log
    );
    let pages = inspected_pdf_pages(&artifact.bytes);
    assert!(pages.len() > 2);
    assert_a4(&pages);
    let text = pages
        .iter()
        .map(|p| p["text"].as_str().unwrap())
        .collect::<String>()
        .split_whitespace()
        .collect::<String>();
    for body in [&responsibility, &achievement, &promotion, &skill, &url] {
        assert!(text.contains(body), "lost text: {body}");
    }
    for (before, after) in [
        ("経歴要約", "活かせるスキル・経験"),
        ("活かせるスキル・経験", "職務経歴"),
        ("主な実績", "架空プロジェクト"),
        ("【担当フェーズ】", "【業務内容】"),
        ("【プロジェクト規模】", "【使用言語】"),
        ("URLTAIL", "自己PR"),
    ] {
        // Exclude the document title when locating the 職務経歴 section.
        let content = text.trim_start_matches("職務経歴書");
        assert!(content.find(before).unwrap() < content.find(after).unwrap());
    }
    let links: Vec<_> = pages
        .iter()
        .flat_map(|p| p["urls"].as_array().unwrap())
        .filter(|target| target.as_str() == Some(&url))
        .collect();
    assert!(
        links.len() > 1,
        "long URL must retain its target across lines"
    );
    for page in &pages {
        let last = page["text"]
            .as_str()
            .unwrap()
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap();
        assert!(
            ![
                "経歴要約",
                "活かせるスキル・経験",
                "職務経歴",
                "自己PR",
                "主な実績",
                "【業務内容】",
                "【実績・取り組み】"
            ]
            .contains(&last.trim()),
            "orphan heading: {last}"
        );
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
