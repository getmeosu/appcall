//! Optional authenticated transport. Embedded builds do not link this crate.
use appcall_engine::*;
use serde::Deserialize;
use serde_json::{json, Value};
pub struct ApiResponse {
    pub status: u16,
    pub body: Vec<u8>,
}
pub struct HttpAdapter<S: Store = SqliteStore> {
    engine: Engine<S>,
    token: Vec<u8>,
    scope: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Start {
    id: String,
    workflow: String,
    version: String,
    input: PayloadRef,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Signal {
    name: String,
    value: PayloadRef,
}
impl<S: Store> HttpAdapter<S> {
    pub fn new(engine: Engine<S>, token: &str) -> Result<Self> {
        if token.len() < 32 || token.len() > 256 || !token.is_ascii() {
            return Err(Error::Invalid("bearer token length"));
        }
        Ok(Self {
            engine,
            token: token.as_bytes().to_vec(),
            scope: None,
        })
    }
    /// Immutable deployment namespace; all holders of this service token share it.
    pub fn with_scope(engine: Engine<S>, token: &str, scope: &str) -> Result<Self> {
        if scope.is_empty()
            || scope.len() > 32
            || !scope
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(Error::Invalid("invalid service scope"));
        }
        let mut adapter = Self::new(engine, token)?;
        adapter.scope = Some(scope.into());
        Ok(adapter)
    }
    fn run_id(&self, id: &str) -> String {
        self.scope
            .as_ref()
            .map_or_else(|| id.into(), |scope| format!("{scope}/{id}"))
    }
    pub fn engine_mut(&mut self) -> &mut Engine<S> {
        &mut self.engine
    }
    pub fn handle(
        &mut self,
        method: &str,
        path: &str,
        authorization: &str,
        body: &[u8],
    ) -> ApiResponse {
        let supplied = authorization
            .strip_prefix("Bearer ")
            .unwrap_or("")
            .as_bytes();
        if supplied.len() != self.token.len()
            || supplied
                .iter()
                .zip(&self.token)
                .fold(0u8, |difference, (a, b)| difference | (a ^ b))
                != 0
        {
            return response(401, json!({"success":false,"error":"unauthorized"}));
        }
        if body.len() > 65536 || path.len() > 4096 {
            return response(413, json!({"success":false,"error":"request_too_large"}));
        }
        match self.route(method, path, body) {
            Ok((status, data)) => response(status, json!({"success":true,"data":data})),
            Err(error) => {
                let (status, code) = match error {
                    Error::NotFound => (404, "not_found"),
                    Error::Conflict | Error::Nondeterminism => (409, "conflict"),
                    Error::Invalid(_) => (400, "invalid_request"),
                    Error::Limit => (413, "limit"),
                    Error::Unavailable => (503, "unavailable"),
                    Error::Storage(_) => (500, "storage_failure"),
                };
                response(status, json!({"success":false,"error":code}))
            }
        }
    }
    fn route(&mut self, method: &str, path: &str, body: &[u8]) -> Result<(u16, Value)> {
        let decoded: Vec<String> = path
            .split('/')
            .map(|part| {
                percent_encoding::percent_decode_str(part)
                    .decode_utf8()
                    .map(|v| v.into_owned())
                    .map_err(|_| Error::Invalid("invalid path"))
            })
            .collect::<Result<_>>()?;
        let parts: Vec<_> = decoded.iter().map(String::as_str).collect();
        match (method, parts.as_slice()) {
            ("POST", ["", "runs"]) => {
                let p: Start = decode(body)?;
                self.engine
                    .start(&self.run_id(&p.id), &p.workflow, &p.version, p.input)?;
                Ok((201, json!({"id":p.id})))
            }
            ("GET", ["", "runs", id]) => Ok((
                200,
                json!({"id":id,"state":self.engine.status(&self.run_id(id))?,"failure_reason":self.engine.failure_reason(&self.run_id(id))?}),
            )),
            ("GET", ["", "runs", id, "history"]) => {
                Ok((200, json!(self.engine.history(&self.run_id(id))?)))
            }
            ("POST", ["", "runs", id, "signals"]) => {
                let p: Signal = decode(body)?;
                self.engine.signal(&self.run_id(id), &p.name, p.value)?;
                Ok((202, json!({"id":id})))
            }
            ("POST", ["", "runs", id, "cancel"]) => {
                if !body.is_empty() && body != b"{}" {
                    return Err(Error::Invalid("unexpected body"));
                }
                self.engine.cancel(&self.run_id(id))?;
                Ok((202, json!({"id":id})))
            }
            _ => Err(Error::NotFound),
        }
    }
}

fn decode<T: serde::de::DeserializeOwned>(body: &[u8]) -> Result<T> {
    serde_json::from_slice(body).map_err(|_| Error::Invalid("invalid JSON request"))
}
fn response(status: u16, body: Value) -> ApiResponse {
    ApiResponse {
        status,
        body: body.to_string().into_bytes(),
    }
}

/// Authentication check usable before a host starts reading a request body.
pub fn is_authorized(token: &[u8], authorization: &str) -> bool {
    let supplied = authorization
        .strip_prefix("Bearer ")
        .unwrap_or("")
        .as_bytes();
    supplied.len() == token.len()
        && supplied
            .iter()
            .zip(token)
            .fold(0u8, |difference, (a, b)| difference | (a ^ b))
            == 0
}

mod actor;
mod deadline_io;
mod transport;
pub use actor::{EngineClient, EngineHost};
pub use transport::{serve, TransportLimits};
