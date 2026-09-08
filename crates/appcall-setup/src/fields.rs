use crate::*;
use appcall_connectors::SetupConfig;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::collections::BTreeMap;
use zeroize::Zeroize;
pub struct Credentials(pub(crate) BTreeMap<String, String>);
impl Credentials {
    /// Import already-resolved credentials while retaining the setup payload bounds.
    pub fn from_fields(fields: BTreeMap<String, String>) -> Result<Self> {
        let credentials = Self(fields);
        if credentials.0.len() > 64
            || credentials
                .0
                .iter()
                .any(|(key, value)| key.len() > 128 || value.len() > 65536)
            || credentials.0.values().map(String::len).sum::<usize>() > 262144
        {
            return Err(Error::InvalidInput);
        }
        Ok(credentials)
    }
    pub fn fields(&self) -> &BTreeMap<String, String> {
        &self.0
    }
}
impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Credentials([REDACTED])")
    }
}
impl Drop for Credentials {
    fn drop(&mut self) {
        for value in self.0.values_mut() {
            value.zeroize();
        }
    }
}
pub fn collect_fields(
    setup: &SetupConfig,
    route: &str,
    input: &BTreeMap<String, String>,
) -> Result<Credentials> {
    if input.len() > 64
        || input
            .iter()
            .any(|(key, value)| key.len() > 128 || value.len() > 65536)
        || input.values().map(String::len).sum::<usize>() > 262144
    {
        return Err(Error::InvalidInput);
    }
    let fields = if setup.routes.is_empty() {
        if !route.is_empty() {
            return Err(Error::UnknownRoute);
        }
        &setup.fields
    } else {
        &setup
            .routes
            .iter()
            .find(|r| r.id == route || route.is_empty())
            .ok_or(Error::UnknownRoute)?
            .fields
    };
    if input
        .keys()
        .any(|key| !fields.iter().any(|f| &f.key == key))
    {
        return Err(Error::InvalidInput);
    }
    let mut result = Credentials(BTreeMap::new());
    for field in fields {
        let value = input
            .get(&field.key)
            .map(String::as_str)
            .unwrap_or("")
            .trim();
        if field.required && value.is_empty() {
            return Err(DeclaredFieldKey::new(&field.key)
                .map(Error::MissingDeclaredField)
                .unwrap_or(Error::MissingField));
        }
        if !value.is_empty() {
            result.0.insert(field.key.clone(), value.to_owned());
        }
    }
    for derive in &setup.derive {
        if derive.kind != "basic" || derive.from.len() != 2 {
            return Err(Error::Unsupported);
        }
        let mut raw = format!(
            "{}:{}",
            result
                .0
                .get(&derive.from[0])
                .map(String::as_str)
                .unwrap_or(""),
            result
                .0
                .get(&derive.from[1])
                .map(String::as_str)
                .unwrap_or("")
        );
        result
            .0
            .insert(derive.field.clone(), STANDARD.encode(raw.as_bytes()));
        raw.zeroize();
    }
    Ok(result)
}
