use super::{breakable_text, has_long_ascii_run};
use serde::{Deserialize, Serialize};

pub const MAX_RENDERED_BODY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BodyNode {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    content: Vec<BodyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    marks: Vec<Mark>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attrs: Option<ListAttrs>,
}

impl BodyNode {
    pub fn has_content(&self) -> bool {
        matches!(
            self.kind.as_str(),
            "text" | "hardBreak" | "bulletList" | "orderedList"
        ) || self.content.iter().any(Self::has_content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn render(value: serde_json::Value) -> Result<String, String> {
        render_body(&serde_json::from_value(value).unwrap())
    }

    #[test]
    fn complete_fixture_matches_expected_tex_without_dropping_or_executing_text() {
        let root = serde_json::from_str(include_str!("../../../tests/fixtures/body-visitor.json"))
            .unwrap();
        assert_eq!(
            render_body(&root).unwrap(),
            include_str!("../../../tests/fixtures/body-visitor.tex")
        );
    }

    #[test]
    fn empty_documents_paragraphs_and_both_mark_orders_have_defined_output() {
        assert_eq!(render(json!({"type":"doc"})).unwrap(), "");
        assert_eq!(render(json!({"type":"doc","content":[]})).unwrap(), "");
        assert_eq!(render(json!({"type":"doc","content":[{"type":"paragraph"},{"type":"paragraph","content":[]}]})).unwrap(), "\\leavevmode{}\\par\n\\leavevmode{}\\par\n");
        for (marks, expected) in [
            (
                json!([{"type":"bold"},{"type":"italic"}]),
                "\\textit{\\textbf{日本語}}",
            ),
            (
                json!([{"type":"italic"},{"type":"bold"}]),
                "\\textbf{\\textit{日本語}}",
            ),
        ] {
            assert_eq!(render(json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"日本語","marks":marks}]}]})).unwrap(), format!("\\leavevmode{{}}{expected}\\par\n"));
        }
    }

    #[test]
    fn long_ascii_runs_across_marks_wrap_without_losing_marks_or_text() {
        let tex = render(
            json!({"type":"doc","content":[{"type":"paragraph","content":[
                {"type":"text","text":"WWWWWW","marks":[{"type":"bold"}]},
                {"type":"text","text":"WWWWWW","marks":[{"type":"italic"}]}
            ]}]}),
        )
        .unwrap();
        assert_eq!(tex.matches("\\allowbreak{}").count(), 12);
        assert_eq!(
            tex.replace("\\allowbreak{}", "").replace("%\n", ""),
            "\\leavevmode{}\\textbf{WWWWWW}\\textit{WWWWWW}\\par\n"
        );
    }

    #[test]
    fn numbered_list_defaults_and_four_levels_use_independent_counters() {
        let mut block = json!({"type":"paragraph","content":[{"type":"text","text":"末尾"}]});
        for start in [65535, 9, 7, 2] {
            block = json!({"type":"orderedList","attrs":{"start":start,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph"},block]}]});
        }
        let tex = render(json!({"type":"doc","content":[block]})).unwrap();
        for (counter, start) in [
            ("enumi", 1),
            ("enumii", 6),
            ("enumiii", 8),
            ("enumiv", 65534),
        ] {
            assert!(tex.contains(&format!("\\setcounter{{{counter}}}{{{start}}}")));
        }
        let tex = render(json!({"type":"doc","content":[{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph"}]}]}]})).unwrap();
        assert!(tex.contains("\\setcounter{enumi}{0}"));
    }

    #[test]
    fn illegal_parent_child_relationships_and_fields_are_rejected() {
        for child in [
            json!({"type":"text","text":"inline"}),
            json!({"type":"hardBreak"}),
            json!({"type":"listItem","content":[{"type":"paragraph"}]}),
            json!({"type":"paragraph","text":"wrong field"}),
            json!({"type":"paragraph","marks":[{"type":"bold"}]}),
            json!({"type":"paragraph","attrs":{"start":2}}),
            json!({"type":"paragraph","content":[{"type":"paragraph"}]}),
            json!({"type":"paragraph","content":[{"type":"text","text":""}]}),
            json!({"type":"paragraph","content":[{"type":"text"}]}),
            json!({"type":"paragraph","content":[{"type":"text","text":"x","content":[{"type":"hardBreak"}]}]}),
            json!({"type":"paragraph","content":[{"type":"hardBreak","content":[{"type":"text","text":"x"}]}]}),
            json!({"type":"bulletList","content":[]}),
            json!({"type":"bulletList","content":[{"type":"paragraph"}]}),
            json!({"type":"orderedList","attrs":{"start":0},"content":[{"type":"listItem","content":[{"type":"paragraph"}]}]}),
            json!({"type":"orderedList","attrs":{"type":"a"},"content":[{"type":"listItem","content":[{"type":"paragraph"}]}]}),
            json!({"type":"orderedList","content":[{"type":"listItem","content":[]}]}),
            json!({"type":"orderedList","content":[{"type":"listItem","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"}]}]}]}]}),
        ] {
            assert!(render(json!({"type":"doc","content":[child]})).is_err());
        }
    }

    #[test]
    fn byte_and_node_limits_accept_the_boundary_and_reject_the_next_value() {
        let value = "日".repeat(21845) + "x";
        assert_eq!(value.len(), 65536);
        let root = |text| json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});
        assert!(render(root(value.clone())).is_ok());
        assert!(render(root(value + "日")).is_err());
        assert!(
            render(json!({"type":"doc","content":vec![json!({"type":"paragraph"});9999]})).is_ok()
        );
        assert!(
            render(json!({"type":"doc","content":vec![json!({"type":"paragraph"});10000]}))
                .is_err()
        );
    }

    #[test]
    fn tex_expansion_keeps_valid_special_character_bodies_within_a_bounded_output() {
        let root = serde_json::from_value(json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"\\".repeat(65536)}]}]})).unwrap();
        let rendered = render_body(&root).unwrap();
        assert!(rendered.len() > 256 * 1024);
        assert!(rendered.len() <= MAX_RENDERED_BODY_BYTES);
        assert_eq!(rendered.matches("\\textbackslash{}").count(), 65536);
        let bundle = super::super::generate(&super::super::Draft {
            name: "境界".into(),
            body: String::new(),
            rich_body: Some(root),
        })
        .unwrap();
        assert!(bundle.content_tex.ends_with(&rendered));
    }

    #[test]
    fn marks_breaks_and_mixed_lists_preserve_structure_and_escape_text() {
        let body: BodyNode =
            serde_json::from_str(include_str!("../../../tests/fixtures/rich-body.json")).unwrap();
        let tex = render_body(&body).unwrap();
        assert!(tex.contains("\\textbf{太字の日本語 \\& \\%}"));
        assert!(tex.contains("\\newline\n\\textit{斜体の本文}"));
        assert!(tex.contains("\\begin{itemize}"));
        assert!(tex.contains("\\begin{enumerate}"));
        assert!(tex.contains("\\setcounter{enumi}{1}"));
        assert!(!tex.contains("\\setcounter{enumii}"));
    }

    #[test]
    fn unsupported_or_malformed_content_is_rejected_instead_of_dropped() {
        for node in [
            json!({"type":"heading"}),
            json!({"type":"text","text":"x","marks":[{"type":"link"}]}),
            json!({"type":"text","text":"x","marks":[{"type":"bold"},{"type":"bold"}]}),
            json!({"type":"text","text":"\u{0000}"}),
        ] {
            let root: BodyNode = serde_json::from_value(
                json!({"type":"doc","content":[{"type":"paragraph","content":[node]}]}),
            )
            .unwrap();
            assert!(render_body(&root).is_err());
        }
        assert!(serde_json::from_value::<BodyNode>(
            json!({"type":"paragraph","attrs":{"alignment":"center"}})
        )
        .is_err());
    }

    #[test]
    fn limits_apply_to_the_whole_body_and_nested_structure() {
        let text = json!({"type":"text","text":"x".repeat(40000)});
        let root: BodyNode = serde_json::from_value(
            json!({"type":"doc","content":[{"type":"paragraph","content":[text.clone(),text]}]}),
        )
        .unwrap();
        assert!(render_body(&root).is_err());
        let mut node = json!({"type":"paragraph"});
        for _ in 0..6 {
            node = json!({"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"},node]}]});
        }
        let root: BodyNode =
            serde_json::from_value(json!({"type":"doc","content":[node]})).unwrap();
        assert!(render_body(&root).is_err());
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Mark {
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ListAttrs {
    #[serde(skip_serializing_if = "Option::is_none")]
    start: Option<u16>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    numbering: Option<String>,
}

pub fn render_body(root: &BodyNode) -> Result<String, String> {
    fn visit(
        node: &BodyNode,
        parent: &str,
        depth: usize,
        lists: usize,
        enumerations: usize,
        budget: &mut (usize, usize),
        ascii_breaks: bool,
    ) -> Result<String, String> {
        let invalid = || "本文の構造または書式が対応範囲外です。".to_string();
        if depth > 16 || budget.0 == 0 {
            return Err("本文の深さまたは要素数が上限を超えています。".into());
        }
        budget.0 -= 1;
        let allowed = match parent {
            "" => node.kind == "doc",
            "doc" | "listItem" => {
                ["paragraph", "bulletList", "orderedList"].contains(&node.kind.as_str())
            }
            "paragraph" => ["text", "hardBreak"].contains(&node.kind.as_str()),
            "bulletList" | "orderedList" => node.kind == "listItem",
            _ => false,
        };
        if !allowed {
            return Err(invalid());
        }
        if node.kind != "text" && (node.text.is_some() || !node.marks.is_empty()) {
            return Err(invalid());
        }
        if node.kind != "orderedList" && node.attrs.is_some() {
            return Err(invalid());
        }
        if let Some(attrs) = &node.attrs {
            if attrs.numbering.is_some() || attrs.start == Some(0) {
                return Err(invalid());
            }
        }
        if node.kind == "text" {
            if !node.content.is_empty() || node.marks.len() > 2 {
                return Err(invalid());
            }
            let text = node.text.as_deref().ok_or_else(invalid)?;
            if text.is_empty() || text.len() > budget.1 || text.chars().any(char::is_control) {
                return Err(invalid());
            }
            budget.1 -= text.len();
            let mut rendered = breakable_text(text, ascii_breaks);
            let mut seen = Vec::new();
            for mark in &node.marks {
                if seen.contains(&mark.kind.as_str()) {
                    return Err(invalid());
                }
                seen.push(mark.kind.as_str());
                rendered = match mark.kind.as_str() {
                    "bold" => format!("\\textbf{{{rendered}}}"),
                    "italic" => format!("\\textit{{{rendered}}}"),
                    _ => return Err(invalid()),
                };
            }
            return Ok(rendered);
        }
        if node.kind == "hardBreak" {
            if !node.content.is_empty() {
                return Err(invalid());
            }
            return Ok("\\newline\n".into());
        }
        let list = ["bulletList", "orderedList"].contains(&node.kind.as_str());
        if list && (lists >= 4 || node.content.is_empty()) {
            return Err(invalid());
        }
        if node.kind == "listItem"
            && (node.content.is_empty() || node.content[0].kind != "paragraph")
        {
            return Err(invalid());
        }
        // Marks can split a single long word into many adjacent text nodes.
        // Detect runs across the paragraph, then retain each node's marks.
        let ascii_breaks = node.kind == "paragraph"
            && has_long_ascii_run(
                &node
                    .content
                    .iter()
                    .map(|child| child.text.as_deref().unwrap_or("\n"))
                    .collect::<String>(),
            );
        let children = node
            .content
            .iter()
            .map(|child| -> Result<String, String> {
                let mut rendered = visit(
                    child,
                    &node.kind,
                    depth + 1,
                    lists + usize::from(list),
                    enumerations + usize::from(node.kind == "orderedList"),
                    budget,
                    ascii_breaks,
                )?;
                if ascii_breaks && child.kind == "text" {
                    rendered.push_str("%\n");
                }
                Ok(rendered)
            })
            .collect::<Result<Vec<_>, _>>()?
            .join("");
        match node.kind.as_str() {
            "doc" => Ok(children),
            "paragraph" => Ok(format!("\\leavevmode{{}}{children}\\par\n")),
            "listItem" => Ok(format!("\\item {children}")),
            "bulletList" => Ok(format!("\\begin{{itemize}}\n{children}\\end{{itemize}}\n")),
            "orderedList" => {
                let start = node.attrs.as_ref().and_then(|a| a.start).unwrap_or(1);
                let counter = ["enumi", "enumii", "enumiii", "enumiv"][enumerations];
                Ok(format!("\\begin{{enumerate}}\n\\renewcommand{{\\label{counter}}}{{\\arabic{{{counter}}}.}}\n\\setcounter{{{counter}}}{{{}}}\n{children}\\end{{enumerate}}\n", start - 1))
            }
            _ => Err(invalid()),
        }
    }
    let rendered = visit(root, "", 0, 0, 0, &mut (10000, 65536), false)?;
    if rendered.len() > MAX_RENDERED_BODY_BYTES {
        return Err("変換後の本文がサイズ上限を超えています。".into());
    }
    Ok(rendered)
}
