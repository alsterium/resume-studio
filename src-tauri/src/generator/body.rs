use super::escape_text;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BodyNode {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    content: Vec<BodyNode>,
    text: Option<String>,
    #[serde(default)]
    marks: Vec<Mark>,
    attrs: Option<ListAttrs>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn marks_breaks_and_mixed_lists_preserve_structure_and_escape_text() {
        let body: BodyNode =
            serde_json::from_str(include_str!("../../../tests/fixtures/rich-body.json")).unwrap();
        let tex = render_body(&body).unwrap();
        assert!(tex.contains("\\textbf{太字の日本語 \\& \\%}"));
        assert!(tex.contains("\\newline\n\\textit{斜体の本文}"));
        assert!(tex.contains("\\begin{itemize}"));
        assert!(tex.contains("\\begin{enumerate}\n\\setcounter{enumi}{1}"));
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Mark {
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ListAttrs {
    start: Option<u16>,
    #[serde(rename = "type")]
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
            if text.len() > budget.1 || text.chars().any(char::is_control) {
                return Err(invalid());
            }
            budget.1 -= text.len();
            let mut rendered = escape_text(text);
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
        let children = node
            .content
            .iter()
            .map(|child| {
                visit(
                    child,
                    &node.kind,
                    depth + 1,
                    lists + usize::from(list),
                    enumerations + usize::from(node.kind == "orderedList"),
                    budget,
                )
            })
            .collect::<Result<Vec<_>, _>>()?
            .join("");
        match node.kind.as_str() {
            "doc" => Ok(children),
            "paragraph" => Ok(format!("{children}\\par\n")),
            "listItem" => Ok(format!("\\item {children}")),
            "bulletList" => Ok(format!("\\begin{{itemize}}\n{children}\\end{{itemize}}\n")),
            "orderedList" => {
                let start = node.attrs.as_ref().and_then(|a| a.start).unwrap_or(1);
                let counter = ["enumi", "enumii", "enumiii", "enumiv"][enumerations];
                Ok(format!("\\begin{{enumerate}}\n\\setcounter{{{counter}}}{{{}}}\n{children}\\end{{enumerate}}\n", start - 1))
            }
            _ => Err(invalid()),
        }
    }
    visit(root, "", 0, 0, 0, &mut (10000, 65536))
}
