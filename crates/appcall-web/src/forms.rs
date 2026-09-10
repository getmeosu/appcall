use crate::Error;
use serde_json::{Map, Number, Value};
use std::collections::BTreeMap;
/// Reassembles the Go `f.dotted.path` guided form convention using a trusted
/// manifest schema. Caller-supplied schema must never replace operation policy.
pub fn assemble_guided_input(
    schema: &Value,
    fields: &BTreeMap<String, Vec<String>>,
) -> Result<Value, Error> {
    if fields.len() > 512 || fields.values().flatten().map(String::len).sum::<usize>() > 65536 {
        return Err(Error::Invalid);
    }
    object(schema, fields, "f", 0)
}
fn object(
    schema: &Value,
    fields: &BTreeMap<String, Vec<String>>,
    prefix: &str,
    depth: usize,
) -> Result<Value, Error> {
    if depth > 16 {
        return Err(Error::Invalid);
    }
    let mut out = Map::new();
    if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
        for (key, node) in properties {
            if let Some(value) = field(node, fields, &format!("{prefix}.{key}"), depth + 1)? {
                out.insert(key.clone(), value);
            }
        }
    }
    Ok(Value::Object(out))
}
fn field(
    schema: &Value,
    fields: &BTreeMap<String, Vec<String>>,
    name: &str,
    depth: usize,
) -> Result<Option<Value>, Error> {
    if depth > 16 {
        return Err(Error::Invalid);
    }
    let values = fields.get(name);
    if values.is_some_and(|v| v.len() != 1) {
        return Err(Error::Invalid);
    }
    let raw = values
        .and_then(|v| v.first())
        .map(|v| v.trim())
        .unwrap_or("");
    let value = match schema.get("type").and_then(Value::as_str).unwrap_or("") {
        "string" => {
            if raw.is_empty() {
                None
            } else {
                Some(Value::String(raw.into()))
            }
        }
        "number" | "integer" => raw
            .parse::<f64>()
            .ok()
            .and_then(Number::from_f64)
            .map(Value::Number),
        "boolean" => match raw {
            "" => None,
            "true" => Some(Value::Bool(true)),
            "false" => Some(Value::Bool(false)),
            _ => return Err(Error::Invalid),
        },
        "array" => {
            let items = schema.get("items").unwrap_or(&Value::Null);
            if nested_array(schema) {
                if raw.is_empty() {
                    None
                } else {
                    let value: Value = serde_json::from_str(raw).map_err(|_| Error::Invalid)?;
                    if value.as_array().is_some_and(|rows| {
                        rows.iter().all(|row| {
                            row.as_array()
                                .is_some_and(|cells| cells.iter().all(is_google_sheets_cell))
                        })
                    }) {
                        Some(value)
                    } else {
                        return Err(Error::Invalid);
                    }
                }
            } else {
                let kind = items
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("string");
                let values = raw
                    .split(',')
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                    .filter_map(|item| match kind {
                        "number" | "integer" => item
                            .parse::<f64>()
                            .ok()
                            .and_then(Number::from_f64)
                            .map(Value::Number),
                        "object"
                            if items
                                .get("properties")
                                .and_then(|p| p.get("email"))
                                .is_some() =>
                        {
                            Some(serde_json::json!({"email":item}))
                        }
                        _ => Some(Value::String(item.into())),
                    })
                    .collect::<Vec<_>>();
                if values.is_empty() {
                    None
                } else {
                    Some(Value::Array(values))
                }
            }
        }
        "object"
            if schema
                .get("properties")
                .and_then(Value::as_object)
                .is_some_and(|p| !p.is_empty()) =>
        {
            let value = object(schema, fields, name, depth)?;
            if value.as_object().is_some_and(|v| v.is_empty()) {
                None
            } else {
                Some(value)
            }
        }
        "object" => {
            let keys = fields.get(&format!("{name}.key"));
            let vals = fields.get(&format!("{name}.val"));
            let mut output = Map::new();
            if let Some(keys) = keys {
                if keys.len() > 64 {
                    return Err(Error::Invalid);
                }
                for (i, key) in keys.iter().enumerate() {
                    let key = key.trim();
                    if !key.is_empty() {
                        output.insert(
                            key.into(),
                            Value::String(
                                vals.and_then(|v| v.get(i))
                                    .map(|v| v.trim())
                                    .unwrap_or("")
                                    .into(),
                            ),
                        );
                    }
                }
            }
            if output.is_empty() {
                None
            } else {
                Some(Value::Object(output))
            }
        }
        _ => None,
    };
    Ok(value)
}

fn nested_array(schema: &Value) -> bool {
    schema.get("type").and_then(Value::as_str) == Some("array")
        && schema
            .get("items")
            .and_then(|items| items.get("type"))
            .and_then(Value::as_str)
            == Some("array")
}

fn is_google_sheets_cell(value: &Value) -> bool {
    matches!(
        value,
        Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null
    )
}

/// Source-class guided controls. `prefix` is server-selected (`f` or
/// `f.runInput`), and the schema is the trusted operation definition.
pub(crate) fn render_guided_fields(
    schema: &Value,
    sample: &Value,
    prefix: &str,
    connector: Option<&str>,
) -> Result<String, Error> {
    render_fields(schema, sample, prefix, 0, connector)
}
fn render_fields(
    schema: &Value,
    sample: &Value,
    prefix: &str,
    depth: usize,
    connector: Option<&str>,
) -> Result<String, Error> {
    if depth > 16 {
        return Err(Error::Invalid);
    }
    let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
        return Ok(String::new());
    };
    let required = |key: &str| {
        schema
            .get("required")
            .and_then(Value::as_array)
            .is_some_and(|keys| keys.iter().any(|v| v.as_str() == Some(key)))
    };
    let mut fields: Vec<_> = properties.iter().collect();
    fields.sort_by_key(|(key, node)| (!required(key), multiline(node), key.as_str()));
    let mut main = String::new();
    let mut optional = String::new();
    for (key, node) in fields {
        let name = format!("{prefix}.{key}");
        let fallback = humanize(key);
        let title = node
            .get("title")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(&fallback);
        let label = if required(key) {
            format!("{title} (Required)")
        } else {
            title.to_owned()
        };
        let content = render_control(
            node,
            sample.get(key).unwrap_or(&Value::Null),
            &name,
            &label,
            depth,
            connector,
        )?;
        if required(key) {
            main.push_str(&content);
        } else {
            optional.push_str(&content);
        }
    }
    if !optional.is_empty() {
        main.push_str(&format!("<details class=\"tk-more-options\"><summary>More options</summary>{optional}</details>"));
    }
    Ok(main)
}

fn humanize(key: &str) -> String {
    let chars: Vec<_> = key.chars().collect();
    let mut label = String::new();
    for (i, ch) in chars.iter().copied().enumerate() {
        if matches!(ch, '_' | '-' | '.') {
            if !label.ends_with(' ') {
                label.push(' ');
            }
        } else {
            if i > 0
                && ch.is_uppercase()
                && (chars[i - 1].is_lowercase()
                    || chars[i - 1].is_uppercase()
                        && chars.get(i + 1).is_some_and(|next| next.is_lowercase()))
            {
                label.push(' ');
            }
            if label.is_empty() {
                label.extend(ch.to_uppercase());
            } else {
                label.push(ch);
            }
        }
    }
    label.trim().to_owned()
}

fn multiline(node: &Value) -> bool {
    nested_array(node)
        || node.get("type").and_then(Value::as_str) == Some("object")
        || node.get("format").and_then(Value::as_str) == Some("textarea")
}

fn text_value(value: &Value) -> String {
    if value.is_null() {
        String::new()
    } else {
        value
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| value.to_string())
    }
}

// Presentation IDs occupy a namespace separate from submitted f.* names and
// dynamic hidden targets. Hex cannot contain generated help/error separators.
pub(crate) fn presentation_id(kind: &str, name: &str) -> String {
    let encoded: String = name.bytes().map(|byte| format!("{byte:02x}")).collect();
    format!("tk-{kind}-{encoded}")
}

fn sample_value(node: &Value, sample: &Value) -> String {
    if nested_array(node) {
        sample
            .as_array()
            .map(|_| sample.to_string())
            .unwrap_or_default()
    } else if node.get("type").and_then(Value::as_str) == Some("array") {
        sample
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .or_else(|| v.get("email").and_then(Value::as_str).map(str::to_owned))
                            .unwrap_or_else(|| v.to_string())
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default()
    } else {
        text_value(sample)
    }
}

fn numeric_step(kind: &str) -> Option<&'static str> {
    match kind {
        "integer" => Some("1"),
        "number" => Some("any"),
        _ => None,
    }
}

fn render_control(
    node: &Value,
    sample: &Value,
    name: &str,
    label: &str,
    depth: usize,
    connector: Option<&str>,
) -> Result<String, Error> {
    use crate::ui;
    let kind = node.get("type").and_then(Value::as_str).unwrap_or("");
    let structured_rows = nested_array(node);
    let help = node
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("");
    let help = if structured_rows {
        "Enter JSON rows as an outer array of arrays. JSON preserves commas, numbers, booleans, and empty strings."
    } else {
        help
    };
    if !structured_rows {
        if let (Some(options), Some(connector)) = (
            node.get("x-dynamic-options")
                .filter(|o| o.get("source").and_then(Value::as_str).is_some()),
            connector,
        ) {
            return dynamic_control(options, sample, name, label, help, connector);
        }
    }
    if kind == "object" {
        let content = if node
            .get("properties")
            .and_then(Value::as_object)
            .is_some_and(|p| !p.is_empty())
        {
            render_fields(node, sample, name, depth + 1, connector)?
        } else {
            map_controls(name)
        };
        return Ok(group(name, label, help, &content));
    }
    if !matches!(kind, "string" | "number" | "integer" | "array" | "boolean") {
        return Ok(String::new());
    }
    let display_label = if structured_rows {
        format!("{label} (JSON rows)")
    } else {
        label.to_owned()
    };
    let value = sample_value(node, sample);
    let example = node
        .get("examples")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .or_else(|| node.get("example"));
    let placeholder = example.map(text_value).unwrap_or_default();
    // A boolean needs three browser states: omit an optional patch field, or
    // submit an explicit true/false value. A select carries all three states
    // through native form submission without duplicate field names.
    let choices = if kind == "boolean" {
        let values = node
            .get("enum")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_bool)
                    .map(|value| value.to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|| vec!["true".into(), "false".into()]);
        Some(std::iter::once(String::new()).chain(values).collect())
    } else {
        node.get("enum").and_then(Value::as_array).map(|values| {
            std::iter::once(String::new())
                .chain(values.iter().map(|value| {
                    value
                        .as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| value.to_string())
                }))
                .collect::<Vec<_>>()
        })
    };
    let options = choices.as_ref().map(|values| {
        values
            .iter()
            .map(|value| ui::SelectOption {
                value,
                label: if kind == "boolean" && value.is_empty() {
                    "Omit"
                } else {
                    value
                },
                disabled: false,
            })
            .collect::<Vec<_>>()
    });
    let control = if structured_rows {
        ui::Control::Textarea
    } else if let Some(options) = &options {
        ui::Control::Select(options)
    } else if kind == "string" && multiline(node) {
        ui::Control::Textarea
    } else {
        ui::Control::Input(if matches!(kind, "number" | "integer") {
            ui::InputType::Number
        } else {
            ui::InputType::Text
        })
    };
    // Required labels report manifest metadata. Guided controls stay optional so
    // a nonempty raw JSON input can replace all guided fields.
    let rendered = ui::Field {
        value: &value,
        help,
        placeholder: &placeholder,
        checked: sample.as_bool() == Some(true),
        ..ui::Field::new(
            &presentation_id("field", name),
            name,
            &display_label,
            control,
        )
    }
    .render();
    let step = options.is_none().then(|| numeric_step(kind)).flatten();
    Ok(match step {
        Some(step) => rendered.replacen(
            " type=\"number\"",
            &format!(" type=\"number\" step=\"{step}\""),
            1,
        ),
        None => rendered,
    })
}

fn group(name: &str, label: &str, help: &str, content: &str) -> String {
    use crate::http::escape;
    let name = presentation_id("group", name);
    let described = if help.is_empty() {
        String::new()
    } else {
        format!(" aria-describedby=\"{}-help\"", escape(&name))
    };
    let help = if help.is_empty() {
        String::new()
    } else {
        format!(
            "<p id=\"{}-help\" class=\"ui-field-help\">{}</p>",
            escape(&name),
            escape(help)
        )
    };
    format!(
        "<fieldset class=\"ui-field\"{described}><legend>{}</legend>{help}{content}</fieldset>",
        escape(label)
    )
}

fn map_controls(name: &str) -> String {
    use crate::ui;
    (0..3)
        .map(|index| {
            let key = ui::Field::new(
                &format!("{}-{index}", presentation_id("map-key", name)),
                &format!("{name}.key"),
                &format!("Key {}", index + 1),
                ui::Control::Input(ui::InputType::Text),
            )
            .render();
            let value = ui::Field::new(
                &format!("{}-{index}", presentation_id("map-value", name)),
                &format!("{name}.val"),
                &format!("Value {}", index + 1),
                ui::Control::Input(ui::InputType::Text),
            )
            .render();
            format!("<div class=\"tk-map-row\">{key}{value}</div>")
        })
        .collect()
}

fn dynamic_control(
    options: &Value,
    sample: &Value,
    name: &str,
    label: &str,
    help: &str,
    connector: &str,
) -> Result<String, Error> {
    use crate::{http::escape, ui};
    let mut url = reqwest::Url::parse(&format!(
        "https://local.invalid/app/connectors/{connector}/options"
    ))
    .map_err(|_| Error::Invalid)?;
    url.query_pairs_mut()
        .append_pair(
            "source",
            options
                .get("source")
                .and_then(Value::as_str)
                .ok_or(Error::Invalid)?,
        )
        .append_pair("fieldName", name);
    for key in ["valueField", "labelField", "searchParam", "detailSource"] {
        if let Some(value) = options.get(key).and_then(Value::as_str) {
            url.query_pairs_mut().append_pair(key, value);
        }
    }
    let endpoint = format!("{}?{}", url.path(), url.query().unwrap_or(""));
    let hidden = ui::Field {
        value: sample.as_str().unwrap_or(""),
        ..ui::Field::new(name, name, "", ui::Control::Input(ui::InputType::Hidden))
    }
    .render();
    let search_id = presentation_id("search", name);
    let list_id = format!("tk-opts-{name}");
    let status_id = format!("{list_id}-status");
    let search = ui::Field {
        help, options_source:Some(ui::LocalPath::new(&endpoint).ok_or(Error::Invalid)?),
        on_input_debounced:Some("@get(evt.target.dataset.optionsSource + '&connectionId=' + encodeURIComponent(document.getElementById('tk-connection').value) + '&q=' + encodeURIComponent(evt.target.value))"),
        ..ui::Field::new(&search_id,"",&format!("Search {label}"),ui::Control::Input(ui::InputType::Search))
    }.render().replacen(
        "<input class=\"ui-control\"",
        &format!(
            "<input role=\"combobox\" aria-haspopup=\"listbox\" aria-autocomplete=\"list\" aria-expanded=\"false\" aria-controls=\"{}\" class=\"ui-control\"",
            escape(&list_id)
        ),
        1,
    );
    Ok(format!(
        "{hidden}{search}<div id=\"{}\" class=\"tk-opts\" role=\"listbox\" aria-label=\"Options for {}\" aria-live=\"polite\" aria-atomic=\"true\" aria-busy=\"false\" data-input-id=\"{}\" data-value-id=\"{}\" data-status-id=\"{}\" hidden></div><p id=\"{}\" class=\"sr-only\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"></p>",
        escape(&list_id),
        escape(label),
        escape(&search_id),
        escape(name),
        escape(&status_id),
        escape(&status_id)
    ))
}
