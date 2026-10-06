use resume_studio_lib::domain::validation::{
    encode_project, parse_project, MAX_IMAGE_BYTES, MAX_PROJECT_BYTES,
};
use serde_json::{json, Value};

fn full() -> Value {
    serde_json::from_str(include_str!("../../tests/fixtures/project-full.json")).unwrap()
}

fn canonicalize(value: &mut Value) {
    match value {
        Value::Array(items) => items.iter_mut().for_each(canonicalize),
        Value::Object(items) => {
            for key in ["content", "marks"] {
                if items
                    .get(key)
                    .is_some_and(|v| v.as_array().is_some_and(Vec::is_empty))
                {
                    items.remove(key);
                }
            }
            if let Some(Value::Object(attrs)) = items.get_mut("attrs") {
                if attrs.get("type") == Some(&Value::Null) {
                    attrs.remove("type");
                }
            }
            items.values_mut().for_each(canonicalize);
        }
        _ => {}
    }
}

#[test]
fn shared_project_fixtures_roundtrip_all_fields_and_formats() {
    for source in [
        include_bytes!("../../tests/fixtures/project-empty.json").as_slice(),
        include_bytes!("../../tests/fixtures/project-full.json").as_slice(),
    ] {
        let project = parse_project(source).unwrap();
        let encoded = encode_project(&project).unwrap();
        let restored = parse_project(&encoded).unwrap();
        assert_eq!(encode_project(&restored).unwrap(), encoded);
        let mut value: Value = serde_json::from_slice(&encoded).unwrap();
        let mut original: Value = serde_json::from_slice(source).unwrap();
        canonicalize(&mut value);
        canonicalize(&mut original);
        assert_eq!(
            value, original,
            "Every field, format and array order must survive"
        );
    }
}

#[test]
fn shared_invalid_contract_cases_are_rejected() {
    let cases: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/project-invalid-cases.json"
    ))
    .unwrap();
    for row in cases.as_array().unwrap() {
        let mut value = full();
        let path = row["path"].as_array().unwrap();
        let mut target = &mut value;
        for key in &path[..path.len() - 1] {
            target = if let Some(index) = key.as_u64() {
                &mut target[index as usize]
            } else {
                &mut target[key.as_str().unwrap()]
            };
        }
        let last = path.last().unwrap().as_str().unwrap();
        if row["remove"] == true {
            target.as_object_mut().unwrap().remove(last);
        } else {
            target[last] = row["value"].clone();
        }
        assert!(
            parse_project(&serde_json::to_vec(&value).unwrap()).is_err(),
            "{}",
            row["name"]
        );
    }
}

#[test]
fn byte_limits_apply_to_body_assets_and_total_json() {
    let mut value = full();
    value["career"]["summary"] = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"日".repeat(22000)}]}]});
    assert!(parse_project(&serde_json::to_vec(&value).unwrap()).is_err());
    let mut value = full();
    value["assets"][0]["base64"] = json!("A".repeat((MAX_IMAGE_BYTES + 1).div_ceil(3) * 4));
    assert!(parse_project(&serde_json::to_vec(&value).unwrap()).is_err());
    assert!(parse_project(&vec![b' '; MAX_PROJECT_BYTES + 1]).is_err());
}

#[test]
fn nested_lists_and_total_body_nodes_are_bounded() {
    let mut block = json!({"type":"paragraph"});
    for _ in 0..5 {
        block = json!({"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"},block]}]});
    }
    let mut value = full();
    value["career"]["summary"] = json!({"type":"doc","content":[block]});
    assert!(parse_project(&serde_json::to_vec(&value).unwrap()).is_err());
    let mut value = full();
    value["career"]["summary"] =
        json!({"type":"doc","content":vec![json!({"type":"paragraph"});10000]});
    assert!(parse_project(&serde_json::to_vec(&value).unwrap()).is_err());
}
