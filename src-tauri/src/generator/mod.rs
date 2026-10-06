use serde::{Deserialize, Serialize};
pub mod body;
pub mod bundle;
pub mod documents;
pub mod templates;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Draft {
    pub name: String,
    pub body: String,
    #[serde(rename = "richBody")]
    pub rich_body: Option<body::BodyNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedBundle {
    pub main_tex: String,
    pub content_tex: String,
    pub resources: Vec<bundle::BundleResource>,
}

pub fn escape_text(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    for c in text.chars() {
        result.push_str(match c {
            '\\' => "\\textbackslash{}",
            '{' => "\\{",
            '}' => "\\}",
            '$' => "\\$",
            '&' => "\\&",
            '#' => "\\#",
            '%' => "\\%",
            '_' => "\\_",
            '^' => "\\textasciicircum{}",
            '~' => "\\textasciitilde{}",
            _ => {
                result.push(c);
                continue;
            }
        });
    }
    result
}

pub(crate) fn has_long_ascii_run(text: &str) -> bool {
    let mut length = 0;
    text.chars().any(|c| {
        length = if c.is_ascii_graphic() { length + 1 } else { 0 };
        // Twelve wide Latin glyphs can exceed a narrow contact column.
        length >= 12
    })
}

pub(crate) fn display_text(text: &str) -> String {
    breakable_text(text, has_long_ascii_run(text))
}

pub(crate) fn breakable_text(text: &str, breaks: bool) -> String {
    if !breaks {
        return escape_text(text);
    }
    let mut result = String::new();
    for (index, c) in text.chars().enumerate() {
        if index > 0 && index % 128 == 0 {
            // TeX input buffers are bounded. A comment joins source lines
            // without inserting a displayed space or changing the paragraph.
            result.push_str("%\n");
        }
        result.push_str(&escape_text(&c.to_string()));
        if c.is_ascii_graphic() {
            result.push_str("\\allowbreak{}");
        }
    }
    result
}

pub fn generate(draft: &Draft) -> Result<GeneratedBundle, String> {
    if draft.name.len() > 1024 || draft.body.len() > 64 * 1024 {
        return Err("氏名または本文がサイズ上限を超えています。".into());
    }
    if draft.name.chars().any(char::is_control)
        || draft
            .body
            .chars()
            .any(|c| c.is_control() && !['\n', '\r', '\t'].contains(&c))
    {
        return Err("氏名または本文に使用できない制御文字があります。".into());
    }
    let body = draft.body.replace("\r\n", "\n").replace('\r', "\n");
    let paragraphs = body
        .split('\n')
        .map(|line| format!("{}\\par\n", escape_text(line)))
        .collect::<String>();
    let paragraphs = if let Some(rich) = &draft.rich_body {
        body::render_body(rich)?
    } else {
        paragraphs
    };
    if paragraphs.len() > body::MAX_RENDERED_BODY_BYTES {
        return Err("本文がサイズ上限を超えています。".into());
    }
    Ok(GeneratedBundle {
        main_tex: include_str!("../../templates/draft/main.tex").into(),
        content_tex: format!("\\section*{{{}}}\n{}", escape_text(&draft.name), paragraphs),
        resources: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_breaks_preserve_short_text_and_escape_long_runs_once() {
        assert_eq!(display_text("架空 Rust 2026"), "架空 Rust 2026");
        assert_eq!(display_text(&"W".repeat(11)), "W".repeat(11));
        assert_eq!(
            display_text(&"W".repeat(12))
                .matches("\\allowbreak{}")
                .count(),
            12
        );
        let value = r"\input{private}&%_";
        assert_eq!(
            display_text(value).replace("\\allowbreak{}", ""),
            escape_text(value)
        );
        assert!(!display_text(value).contains(r"\input{"));
        let long = "W".repeat(65536);
        let source = display_text(&long);
        assert!(source.lines().all(|line| line.len() < 4096));
        assert_eq!(
            source.replace("\\allowbreak{}", "").replace("%\n", ""),
            long
        );
    }

    #[test]
    fn escapes_every_tex_special_character_once() {
        assert_eq!(
            escape_text("\\{}$&#%_^~"),
            "\\textbackslash{}\\{\\}\\$\\&\\#\\%\\_\\textasciicircum{}\\textasciitilde{}"
        );
        assert_eq!(escape_text("架空 山田"), "架空 山田");
    }

    #[test]
    fn normalizes_newlines_without_turning_input_into_commands() {
        let bundle = generate(&Draft {
            name: "架空 山田".into(),
            body: "\\input{secret}\r\n次の段落\r終わり".into(),
            rich_body: None,
        })
        .unwrap();
        assert!(bundle
            .content_tex
            .contains("\\textbackslash{}input\\{secret\\}\\par\n次の段落\\par\n終わり\\par"));
        assert!(!bundle.content_tex.contains("\\input{secret}"));
    }

    #[test]
    fn rejects_oversized_or_control_character_input() {
        for draft in [
            Draft {
                name: "x".repeat(1025),
                body: String::new(),
                rich_body: None,
            },
            Draft {
                name: "架空".into(),
                body: "x".repeat(65537),
                rich_body: None,
            },
            Draft {
                name: "名\n前".into(),
                body: String::new(),
                rich_body: None,
            },
            Draft {
                name: "架空".into(),
                body: "\0".into(),
                rich_body: None,
            },
        ] {
            assert!(generate(&draft).is_err());
        }
    }
}
