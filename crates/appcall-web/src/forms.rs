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
        "boolean" => {
            if raw.is_empty() {
                None
            } else {
                Some(Value::Bool(true))
            }
        }
        "array" => {
            let items = schema.get("items").unwrap_or(&Value::Null);
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
    use crate::http::escape;
    if depth > 16 {
        return Err(Error::Invalid);
    }
    let mut html = String::new();
    let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
        return Ok(html);
    };
    for (key, node) in properties {
        let name = format!("{prefix}.{key}");
        let name = escape(&name);
        let label = escape(node.get("title").and_then(Value::as_str).unwrap_or(key));
        let description = escape(
            node.get("description")
                .and_then(Value::as_str)
                .unwrap_or(""),
        );
        let kind = node.get("type").and_then(Value::as_str).unwrap_or("");
        let sample = sample.get(key).unwrap_or(&Value::Null);
        let class="w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100 focus:border-neon-ice-500 focus:outline-none focus:ring-1 focus:ring-neon-ice-500";
        if let (Some(source), Some(connector)) = (
            node.get("x-dynamic-options")
                .and_then(|o| o.get("source"))
                .and_then(Value::as_str),
            connector,
        ) {
            let opts = node.get("x-dynamic-options").ok_or(Error::Invalid)?;
            let mut url = reqwest::Url::parse(&format!(
                "https://local.invalid/app/toolkits/{connector}/options"
            ))
            .map_err(|_| Error::Invalid)?;
            url.query_pairs_mut()
                .append_pair("source", source)
                .append_pair("fieldName", &format!("{prefix}.{key}"));
            for key in ["valueField", "labelField", "searchParam", "detailSource"] {
                if let Some(value) = opts.get(key).and_then(Value::as_str) {
                    url.query_pairs_mut().append_pair(key, value);
                }
            }
            let endpoint = format!("{}?{}", url.path(), url.query().unwrap_or(""));
            html.push_str(&format!("<label class=\"block\"><span class=\"mb-1.5 block text-sm font-medium text-dusk-blue-200\">{label}</span><input id=\"{name}\" type=\"hidden\" name=\"{name}\" value=\"{}\"><input type=\"search\" aria-label=\"Search {label}\" class=\"{class}\" data-on:input__debounce.300ms=\"@get('{}' + '&amp;connectionId=' + encodeURIComponent(document.getElementById('tk-connection').value) + '&amp;q=' + encodeURIComponent(evt.target.value))\"><div id=\"tk-opts-{name}\"></div></label>",escape(sample.as_str().unwrap_or("")),escape(&endpoint)));
            continue;
        }
        let control=match kind{
   "object" if node.get("properties").and_then(Value::as_object).is_some_and(|p|!p.is_empty())=>render_fields(node,sample,&format!("{prefix}.{key}"),depth+1,connector)?,
   "object"=>(0..3).map(|_|format!("<div class=\"flex gap-2\"><input aria-label=\"{label} key\" name=\"{name}.key\" placeholder=\"Key\" class=\"{class}\"><input aria-label=\"{label} value\" name=\"{name}.val\" placeholder=\"Value\" class=\"{class}\"></div>")).collect::<String>(),
   "boolean"=>format!("<input type=\"checkbox\" name=\"{name}\" value=\"true\" {}>",if sample.as_bool()==Some(true){"checked"}else{""}),
   "string"|"number"|"integer"|"array"=>{
    let value=if kind=="array"{sample.as_array().map(|items|items.iter().map(|v|v.as_str().map(str::to_owned).or_else(||v.get("email").and_then(Value::as_str).map(str::to_owned)).unwrap_or_else(||v.to_string())).collect::<Vec<_>>().join(", ")).unwrap_or_default()}else if sample.is_null(){String::new()}else{sample.as_str().map(str::to_owned).unwrap_or_else(||sample.to_string())};
    if let Some(options)=node.get("enum").and_then(Value::as_array){let options=options.iter().map(|v|{let raw=v.as_str().map(str::to_owned).unwrap_or_else(||v.to_string());format!("<option value=\"{}\" {}>{}</option>",escape(&raw),if raw==value{"selected"}else{""},escape(&raw))}).collect::<String>();format!("<select name=\"{name}\" class=\"{class}\"><option value=\"\"></option>{options}</select>")}
    else{format!("<input type=\"{}\" name=\"{name}\" value=\"{}\" class=\"{class}\">",if kind=="number" || kind=="integer"{"number"}else{"text"},escape(&value))}
   },_=>continue
  };
        html.push_str(&format!("<label class=\"block\"><span class=\"mb-1.5 block text-sm font-medium text-dusk-blue-200\">{label}</span>{control}<span class=\"text-xs text-dusk-blue-500\">{description}</span></label>"));
    }
    Ok(html)
}
