use resume_studio_lib::{
    domain::validation::parse_project,
    generator::{
        bundle::{write_bundle, BundleResource},
        documents::generate_project,
        templates::{bundled_templates, resolve, DocumentKind},
    },
};
use std::{fs, io::ErrorKind};

#[test]
fn formal_documents_preserve_fields_and_export_owned_resources() {
    let project = parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    for kind in [DocumentKind::Resume, DocumentKind::Career] {
        let bundle = generate_project(&project, kind).unwrap();
        let displayed = bundle.content_tex.replace("\\allowbreak{}", "");
        let repeated = generate_project(&project, kind).unwrap();
        assert_eq!(bundle.content_tex, repeated.content_tex);
        assert_eq!(bundle.main_tex, repeated.main_tex);
        let directory = tempfile::tempdir().unwrap();
        write_bundle(directory.path(), &bundle).unwrap();
        assert_eq!(
            fs::read_to_string(directory.path().join("content.tex")).unwrap(),
            bundle.content_tex
        );
        for resource in &bundle.resources {
            assert_eq!(
                fs::read(directory.path().join(&resource.name)).unwrap(),
                resource.bytes
            );
        }
        assert!(bundle.main_tex.contains("\\input{content.tex}"));
        assert!(bundle.content_tex.contains(&project.profile.name));
        assert!(bundle.content_tex.contains("架空資格"));
        assert!(bundle
            .content_tex
            .contains("\\textbf{太字の日本語 \\& \\%}"));
        match kind {
            DocumentKind::Resume => {
                assert!(bundle.content_tex.contains("\\ResumePhoto{photo-1.png}"));
                assert!(directory.path().join("photo-1.png").is_file());
                for value in [
                    &project.profile.name_kana,
                    &project.profile.address,
                    &project.profile.address_kana,
                    &project.profile.phone,
                    &project.profile.email,
                ] {
                    assert!(displayed.contains(value), "missing {value}");
                }
                assert!(bundle
                    .content_tex
                    .contains("\\ResumeHistoryRow{2012}{04}{架空株式会社 入社}"));
                assert!(!bundle.content_tex.contains("CareerCompany"));
            }
            DocumentKind::Career => {
                assert!(!directory.path().join("photo-1.png").exists());
                for value in [
                    "架空株式会社",
                    "エンジニア",
                    "架空システム開発",
                    "1,000万円",
                    "30名",
                    "架空プロジェクト",
                    "設計、実装",
                    "TypeScript、Rust",
                    "React、Tauri",
                    "5名",
                    "Rust（3年）",
                    "架空の実務経験",
                    "在籍中",
                ] {
                    assert!(displayed.contains(value), "missing {value}");
                }
                assert!(bundle
                    .content_tex
                    .contains("\\CareerURL{https://example.com/project?a=1\\&b=2}"));
                assert!(!bundle.content_tex.contains("ResumePhoto"));
            }
        }
        assert_eq!(
            write_bundle(directory.path(), &bundle).unwrap_err().kind(),
            ErrorKind::AlreadyExists
        );
    }
}

#[test]
fn exact_template_kind_version_and_schema_are_required() {
    let mut project =
        parse_project(include_bytes!("../../tests/fixtures/project-empty.json")).unwrap();
    assert_eq!(bundled_templates().len(), 5);
    for template in bundled_templates() {
        assert_eq!(template.manifest.engine, "lualatex");
        assert_eq!(template.manifest.schema_versions, [1]);
        assert!(!template.manifest.packages.is_empty());
        assert!(!template.manifest.fonts.is_empty());
    }
    assert!(resolve(&project.templates.resume, DocumentKind::Career, 1).is_err());
    assert!(resolve(&project.templates.resume, DocumentKind::Resume, 2).is_err());
    project.templates.resume.version = "99.0.0".into();
    assert!(generate_project(&project, DocumentKind::Resume)
        .unwrap_err()
        .contains("TEMPLATE_NOT_FOUND"));
    assert_eq!(project.templates.resume.version, "99.0.0");
    assert!(generate_project(&project, DocumentKind::Career).is_ok());
    project.templates.career.id = "unknown".into();
    assert!(generate_project(&project, DocumentKind::Career).is_err());
}

#[test]
fn every_body_and_optional_field_is_escaped_once_and_order_is_preserved() {
    let mut value: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    let special = r"&%_#$ {}~^\input{private}";
    value["profile"]["name"] = special.into();
    let body = serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":special}]}]});
    for key in ["motivation", "preferences"] {
        value["resume"][key] = body.clone();
    }
    for key in ["summary", "selfPromotion"] {
        value["career"][key] = body.clone();
    }
    for key in ["overview", "responsibilities", "achievements"] {
        value["career"]["positions"][0]["projects"][0][key] = body.clone();
    }
    value["career"]["positions"][0]["projects"][0]["url"] =
        "https://example.com/%7Btext%7D?a=1&b=2#fragment".into();
    value["resume"]["education"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({"id":"second-row","yearMonth":"2010-01","text":"順序二番目"}));
    let project = parse_project(&serde_json::to_vec(&value).unwrap()).unwrap();
    let escaped = resume_studio_lib::generator::escape_text(special);
    let resume = generate_project(&project, DocumentKind::Resume).unwrap();
    assert_eq!(
        resume
            .content_tex
            .replace("\\allowbreak{}", "")
            .replace("%\n", "")
            .matches(&escaped)
            .count(),
        3
    );
    assert!(
        resume.content_tex.find("架空大学 卒業").unwrap()
            < resume.content_tex.find("順序二番目").unwrap()
    );
    assert!(resume.content_tex.contains("満36歳"));
    assert!(resume.content_tex.contains("任意"));
    assert!(resume.content_tex.contains("架空の連絡先"));
    let career = generate_project(&project, DocumentKind::Career).unwrap();
    assert_eq!(
        career
            .content_tex
            .replace("\\allowbreak{}", "")
            .replace("%\n", "")
            .matches(&escaped)
            .count(),
        6
    );
    for label in ["プロジェクト概要", "業務内容", "実績・取り組み", "自己PR"] {
        assert!(career.content_tex.contains(label));
    }
    assert!(career
        .content_tex
        .contains(r"\CareerURL{https://example.com/\%7Btext\%7D?a=1\&b=2\#fragment}"));
    assert!(career
        .content_tex
        .contains(r"\%\allowbreak{}7\allowbreak{}B\allowbreak{}t"));
    assert!(!career.content_tex.contains(r"\input{private}"));
}

#[test]
fn empty_self_promotion_does_not_emit_a_heading_without_content() {
    let project = parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    assert!(!project.career.self_promotion.has_content());
    let career = generate_project(&project, DocumentKind::Career).unwrap();
    assert!(!career.content_tex.contains("\\CareerSection{自己PR}"));
}

#[test]
fn bundle_rejects_paths_duplicates_and_existing_symlinks_before_writing() {
    let project = parse_project(include_bytes!("../../tests/fixtures/project-empty.json")).unwrap();
    for name in [
        "../outside.tex",
        "/tmp/outside.tex",
        "main.tex",
        "resume.sty",
    ] {
        let mut bundle = generate_project(&project, DocumentKind::Resume).unwrap();
        bundle.resources.push(BundleResource {
            name: name.into(),
            bytes: b"unexpected".to_vec(),
        });
        let directory = tempfile::tempdir().unwrap();
        assert_eq!(
            write_bundle(directory.path(), &bundle).unwrap_err().kind(),
            ErrorKind::InvalidInput
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    }
    #[cfg(unix)]
    {
        let directory = tempfile::tempdir().unwrap();
        let original = directory.path().join("original");
        fs::write(&original, "keep").unwrap();
        std::os::unix::fs::symlink(&original, directory.path().join("content.tex")).unwrap();
        let bundle = generate_project(&project, DocumentKind::Resume).unwrap();
        assert_eq!(
            write_bundle(directory.path(), &bundle).unwrap_err().kind(),
            ErrorKind::AlreadyExists
        );
        assert!(!directory.path().join("main.tex").exists());
        assert_eq!(fs::read_to_string(original).unwrap(), "keep");
    }
}

#[test]
fn resume_revision_preserves_saved_version_and_exports_jis_style() {
    let mut project =
        parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    let original = generate_project(&project, DocumentKind::Resume).unwrap();
    assert_eq!(project.templates.resume.version, "1.0.0");
    project.templates.resume.version = "1.1.0".into();
    let revised = generate_project(&project, DocumentKind::Resume).unwrap();
    assert_eq!(original.content_tex, revised.content_tex);
    let style = |bundle: &resume_studio_lib::generator::GeneratedBundle| {
        bundle
            .resources
            .iter()
            .find(|resource| resource.name == "resume.sty")
            .unwrap()
            .bytes
            .clone()
    };
    assert_eq!(
        style(&original),
        include_bytes!("../templates/resume-standard/resume.sty")
    );
    assert_eq!(
        style(&revised),
        include_bytes!("../templates/resume-standard-v1.1/resume.sty")
    );
    assert_ne!(style(&original), style(&revised));
    let directory = tempfile::tempdir().unwrap();
    write_bundle(directory.path(), &revised).unwrap();
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.path().join("manifest.json")).unwrap()).unwrap();
    assert_eq!(manifest["version"], "1.1.0");
}

#[test]
fn reference_revisions_export_both_documents_without_changing_their_content() {
    let mut project =
        parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    for (kind, version, style_name) in [
        (DocumentKind::Resume, "1.2.0", "resume.sty"),
        (DocumentKind::Career, "1.1.0", "career.sty"),
    ] {
        let original = generate_project(&project, kind).unwrap();
        match kind {
            DocumentKind::Resume => project.templates.resume.version = version.into(),
            DocumentKind::Career => project.templates.career.version = version.into(),
        }
        let revised = generate_project(&project, kind).unwrap();
        assert_eq!(original.content_tex, revised.content_tex);
        assert!(revised.main_tex.contains("HaranoAjiGothic-Regular.otf"));
        let directory = tempfile::tempdir().unwrap();
        write_bundle(directory.path(), &revised).unwrap();
        assert!(directory.path().join(style_name).is_file());
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(directory.path().join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(manifest["version"], version);
    }
}

#[test]
fn career_uses_independent_qualifications_and_formats_acquisition_months() {
    let mut project =
        parse_project(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    project.career.qualifications[0].text = "職務経歴書専用資格".into();
    project.career.qualifications[0].year_month = "2020-04".into();
    for date in ["2020-04", ""] {
        project.career.qualifications[0].year_month = date.into();
        let career = generate_project(&project, DocumentKind::Career)
            .unwrap()
            .content_tex
            .replace("\\allowbreak{}", "")
            .replace("%\n", "");
        assert!(career.contains("職務経歴書専用資格"));
        assert!(!career.contains("架空資格"));
        assert!(career.contains(if date.is_empty() {
            "\\CareerSkill{職務経歴書専用資格}{}"
        } else {
            "\\CareerSkill{職務経歴書専用資格}{2020年4月 取得}"
        }));
        let resume = generate_project(&project, DocumentKind::Resume)
            .unwrap()
            .content_tex;
        assert!(resume.contains("架空資格"));
        assert!(!resume.contains("職務経歴書専用資格"));
    }
}
