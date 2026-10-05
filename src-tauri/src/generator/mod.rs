use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Draft {
    pub name: String,
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedBundle {
    pub main_tex: String,
    pub content_tex: String,
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
    Ok(GeneratedBundle {
        main_tex: include_str!("../../templates/draft/main.tex").into(),
        content_tex: format!("\\section*{{{}}}\n{}", escape_text(&draft.name), paragraphs),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
            },
            Draft {
                name: "架空".into(),
                body: "x".repeat(65537),
            },
            Draft {
                name: "名\n前".into(),
                body: String::new(),
            },
            Draft {
                name: "架空".into(),
                body: "\0".into(),
            },
        ] {
            assert!(generate(&draft).is_err());
        }
    }
}
