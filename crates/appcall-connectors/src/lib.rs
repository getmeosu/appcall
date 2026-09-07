//! Immutable manifest registry shared by embedded and service Rust control planes.
//! Unknown runner fields are retained; evidence digests cover exact source bytes.
mod json;
mod schema;
mod types;
mod validation;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fmt, fs, io::Read, path::Path, sync::Arc};
pub use types::*;
pub use validation::CATEGORIES;

pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    InvalidManifest,
    DuplicateConnector,
    UnknownConnector,
    UnknownOperation,
    Storage,
    InvalidInput,
    InvalidOutput,
    UnsupportedSchema,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    code: ErrorCode,
    field: &'static str,
}
impl Error {
    pub fn code(&self) -> ErrorCode {
        self.code
    }
    pub fn field(&self) -> &'static str {
        self.field
    }
    fn invalid(field: &'static str) -> Self {
        Self {
            code: ErrorCode::InvalidManifest,
            field,
        }
    }
    fn new(code: ErrorCode) -> Self {
        Self { code, field: "" }
    }
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "connector {:?}: {}", self.code, self.field)
    }
}
impl std::error::Error for Error {}

const MAX_MANIFEST_BYTES: usize = 4 * 1024 * 1024;
#[derive(Clone)]
pub struct Connector {
    manifest: Manifest,
    raw: Value,
    bytes: Vec<u8>,
    digest: String,
}
impl fmt::Debug for Connector {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Connector")
            .field("digest", &self.digest)
            .finish_non_exhaustive()
    }
}
impl Connector {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.len() > MAX_MANIFEST_BYTES {
            return Err(Error::invalid("size"));
        }
        let raw = json::parse(bytes).map_err(|_| Error::invalid("json"))?;
        let manifest: Manifest =
            serde_json::from_value(raw.clone()).map_err(|_| Error::invalid("json"))?;
        manifest.validate()?;
        let digest = Sha256::digest(bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        Ok(Self {
            manifest,
            raw,
            bytes: bytes.to_vec(),
            digest,
        })
    }
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }
    pub fn raw_manifest(&self) -> &Value {
        &self.raw
    }
    pub fn raw_bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub fn manifest_digest(&self) -> &str {
        &self.digest
    }
    pub fn operation(&self, key: &str) -> Result<&Operation> {
        self.manifest
            .operations
            .get(key)
            .ok_or_else(|| Error::new(ErrorCode::UnknownOperation))
    }
}
#[derive(Debug, Clone, Default)]
pub struct Registry {
    // Published registries are immutable. Request pinning shares their storage.
    connectors: Arc<BTreeMap<String, Connector>>,
}
impl Registry {
    pub fn load(root: impl AsRef<Path>) -> Result<Self> {
        let mut result = Self::default();
        load_directory(root.as_ref(), 0, &mut result)?;
        Ok(result)
    }
    pub fn from_connectors(connectors: impl IntoIterator<Item = Connector>) -> Result<Self> {
        let mut result = Self::default();
        for c in connectors {
            result.insert(c)?;
        }
        Ok(result)
    }
    fn insert(&mut self, c: Connector) -> Result<()> {
        if self.connectors.contains_key(&c.manifest.key) {
            return Err(Error::new(ErrorCode::DuplicateConnector));
        }
        Arc::make_mut(&mut self.connectors).insert(c.manifest.key.clone(), c);
        Ok(())
    }
    pub fn connector(&self, key: &str) -> Result<&Connector> {
        self.connectors
            .get(key)
            .ok_or_else(|| Error::new(ErrorCode::UnknownConnector))
    }
    pub fn public_connector(&self, key: &str) -> Result<&Connector> {
        let c = self.connector(key)?;
        if c.manifest.is_public() {
            Ok(c)
        } else {
            Err(Error::new(ErrorCode::UnknownConnector))
        }
    }
    pub fn operation(&self, connector: &str, operation: &str) -> Result<&Operation> {
        self.connector(connector)?.operation(operation)
    }
    pub fn list(&self) -> impl ExactSizeIterator<Item = &Connector> {
        self.connectors.values()
    }
    pub fn public_list(&self) -> impl Iterator<Item = &Connector> {
        self.list().filter(|c| c.manifest.is_public())
    }
    pub fn credential_fields(&self, connector: &str) -> Result<Vec<&str>> {
        let setup = &self.connector(connector)?.manifest.auth.setup;
        let mut fields: Vec<&str> = setup.fields.iter().map(|f| f.key.as_str()).collect();
        fields.extend(
            setup
                .routes
                .iter()
                .flat_map(|r| r.fields.iter())
                .map(|f| f.key.as_str()),
        );
        fields.extend(setup.derive.iter().map(|d| d.field.as_str()));
        fields.sort_unstable();
        fields.dedup();
        Ok(fields)
    }
}
fn load_directory(root: &Path, depth: usize, registry: &mut Registry) -> Result<()> {
    if depth > 64 {
        return Err(Error::new(ErrorCode::Storage));
    }
    let mut entries = fs::read_dir(root)
        .map_err(|_| Error::new(ErrorCode::Storage))?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|_| Error::new(ErrorCode::Storage))?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let kind = entry
            .file_type()
            .map_err(|_| Error::new(ErrorCode::Storage))?;
        if kind.is_dir() {
            load_directory(&entry.path(), depth + 1, registry)?;
        } else if entry.file_name() == "manifest.json" {
            let file = fs::File::open(entry.path()).map_err(|_| Error::new(ErrorCode::Storage))?;
            let mut bytes = Vec::new();
            file.take(MAX_MANIFEST_BYTES as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| Error::new(ErrorCode::Storage))?;
            registry.insert(Connector::from_bytes(&bytes)?)?;
        }
    }
    Ok(())
}
