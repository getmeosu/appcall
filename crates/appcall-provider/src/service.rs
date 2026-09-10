use crate::*;
use appcall_store::{Status, Store};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use zeroize::Zeroizing;
#[derive(Default, Clone)]
pub struct Config {
    pub public_base_url: String,
    pub success_redirect_url: String,
    pub signing_secret: String,
    pub allow_loopback_http: bool,
}
pub struct WorkspaceCredentials {
    pub api_key: Zeroizing<String>,
    pub dsn: Zeroizing<String>,
}
pub trait Credentials: Send + Sync {
    fn database_health(&self) -> Option<bool> {
        None
    }
    fn resolve(&self, project: &str) -> Result<WorkspaceCredentials>;
}
pub struct StoreCredentials {
    store: Arc<Mutex<Store>>,
}
impl StoreCredentials {
    pub fn new(store: Arc<Mutex<Store>>) -> Self {
        Self { store }
    }
}
impl Credentials for StoreCredentials {
    fn database_health(&self) -> Option<bool> {
        match self.store.try_lock() {
            Ok(store) => store.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    fn resolve(&self, project: &str) -> Result<WorkspaceCredentials> {
        let error = || {
            Error::new(
                502,
                "UNIPILE_UNAVAILABLE",
                "The Unipile workspace is not configured.",
            )
        };
        let mut store = self.store.lock().map_err(|_| error())?;
        let connection = store
            .get_platform_connection(project, "unipile")
            .map_err(|_| error())?;
        if connection.status != Status::Active {
            return Err(error());
        }
        let raw = store
            .load_secret(project, &connection.secret_ref_id)
            .map_err(|_| error())?;
        let mut fields: BTreeMap<String, String> =
            serde_json::from_slice(raw.as_bytes()).map_err(|_| error())?;
        let key = Zeroizing::new(fields.remove("apiKey").ok_or_else(error)?);
        let dsn = Zeroizing::new(fields.remove("dsn").ok_or_else(error)?);
        use zeroize::Zeroize;
        for value in fields.values_mut() {
            value.zeroize();
        }
        Ok(WorkspaceCredentials { api_key: key, dsn })
    }
}
pub trait AccountGate: Send + Sync {
    fn database_health(&self) -> Option<bool> {
        None
    }
    fn limit(&self, project: &str) -> Result<i64>;
}
#[derive(Default)]
pub struct ConfigGate {
    pub default_limit: i64,
    pub project_limits: BTreeMap<String, i64>,
}
impl AccountGate for ConfigGate {
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }
    fn limit(&self, project: &str) -> Result<i64> {
        Ok(*self
            .project_limits
            .get(project)
            .unwrap_or(&self.default_limit))
    }
}
pub struct Service {
    pub(crate) db: Mutex<postgres::Client>,
    pub(crate) credentials: Arc<dyn Credentials>,
    pub(crate) gate: Arc<dyn AccountGate>,
    pub(crate) config: Config,
}
impl Service {
    pub fn database_health(&self) -> Option<bool> {
        let states = [
            database_health(&self.db),
            self.credentials.database_health(),
            self.gate.database_health(),
        ];
        if states.contains(&Some(false)) {
            Some(false)
        } else if states.contains(&None) {
            None
        } else {
            Some(true)
        }
    }
    pub fn new(
        mut db: postgres::Client,
        credentials: Arc<dyn Credentials>,
        gate: Arc<dyn AccountGate>,
        config: Config,
    ) -> Result<Self> {
        db.batch_execute("SET statement_timeout='10s'; SET lock_timeout='5s'")?;
        Ok(Self {
            db: Mutex::new(db),
            credentials,
            gate,
            config,
        })
    }
    pub(crate) fn client(&self, project: &str) -> Result<Client> {
        let credentials = self.credentials.resolve(project)?;
        Client::new(
            &credentials.dsn,
            &credentials.api_key,
            self.config.allow_loopback_http,
        )
    }
    /// Call only after API authentication except notify, or relations with a signed token.
    /// A narrowed bearer must pass its authenticated brand as brand_scope.
    pub fn handle(
        &self,
        project: &str,
        brand_scope: Option<&str>,
        operation: &str,
        body: &Value,
        token: Option<&str>,
    ) -> Result<Value> {
        self.handle_checked(project, brand_scope, operation, body, token, &|| true)
    }
    pub fn handle_checked(
        &self,
        project: &str,
        brand_scope: Option<&str>,
        operation: &str,
        body: &Value,
        token: Option<&str>,
        active: &dyn Fn() -> bool,
    ) -> Result<Value> {
        ensure_active(active)?;
        if !body.is_object() {
            return Err(Error::new(
                400,
                "INVALID_JSON",
                "Request body must be valid JSON.",
            ));
        }
        if operation == "notify" {
            return self.notify(body, token.unwrap_or_default(), active);
        }
        let project = if operation == "relations" && token.is_some_and(|v| !v.is_empty()) {
            appcall_auth::WebhookVerifier::new(&self.config.signing_secret)
                .map_err(|_| Error::unauthorized())?
                .verify_scoped(token.unwrap(), "unipile", "relations")
                .map_err(|_| Error::unauthorized())?
                .project_id
        } else {
            project.to_owned()
        };
        if project.is_empty() {
            return Err(Error::unauthorized());
        }
        let brand = string(body, "brandId")?;
        if let Some(scope) = brand_scope {
            if operation == "relations" || scope != brand {
                return Err(Error::new(
                    403,
                    "FORBIDDEN",
                    "The request is outside the authenticated account scope.",
                ));
            }
        }
        if !matches!(operation, "accepted" | "relations") && brand.is_empty() {
            return Err(Error::new(400, "MISSING_BRAND", "brandId is required."));
        }
        match operation {
            "hosted" => self.hosted(&project, brand, body, active),
            "capture" => {
                let channel = string(body, "channel")?;
                if !known_channel(channel) {
                    return Err(Error::new(
                        400,
                        "INVALID_CHANNEL",
                        "channel must be one of LINKEDIN, MAIL, MESSAGING.",
                    ));
                }
                self.list(&project, brand, Some(channel))
            }
            "list" => self.list(&project, brand, None),
            "accepted" => self.accepted(&project, brand, cursor(body, "sinceCursor")?),
            "disconnect" => self.disconnect(&project, brand, string(body, "channel")?, active),
            "relations" => self.relations(
                &project,
                string(body, "account_id")?,
                string(body, "user_provider_id")?,
                active,
            ),
            _ => Err(Error::new(404, "NOT_FOUND", "The route was not found.")),
        }
    }
    fn hosted(
        &self,
        project: &str,
        brand: &str,
        body: &Value,
        active: &dyn Fn() -> bool,
    ) -> Result<Value> {
        let providers: Vec<String> = match body.get("providers") {
            None | Some(Value::Null) => vec![],
            Some(value) => serde_json::from_value(value.clone()).map_err(|_| {
                Error::new(
                    400,
                    "INVALID_PROVIDERS",
                    "providers must be an array of provider names.",
                )
            })?,
        };
        if providers.len() > 16 || providers.iter().any(|p| channel(p).is_none()) {
            return Err(Error::new(
                400,
                "INVALID_PROVIDERS",
                "The requested provider is unsupported.",
            ));
        }
        let limit = self.gate.limit(project).map_err(|_| Error::denied(0, 0))?;
        self.check_gate(
            project,
            brand,
            if providers.len() == 1 {
                channel(&providers[0]).unwrap_or("")
            } else {
                ""
            },
            limit,
        )?;
        if self.config.public_base_url.is_empty() {
            return Err(Error::new(
                503,
                "UNIPILE_CORRELATION_UNAVAILABLE",
                "Hosted account correlation is not configured.",
            ));
        }
        let client = self.client(project)?;
        ensure_active(active)?;
        let (flow, token, expires) = self.create_flow(project, brand, &providers, active)?;
        let url = format!(
            "{}/v1/connectors/unipile/setup/notify?token={token}",
            self.config.public_base_url.trim_end_matches('/')
        );
        ensure_active(active)?;
        Ok(
            json!({"link":client.hosted(&flow,&url,&providers,&expires,&self.config.success_redirect_url)?}),
        )
    }
    fn notify(&self, body: &Value, token: &str, active: &dyn Fn() -> bool) -> Result<Value> {
        let status = string(body, "status")?;
        let account = string(body, "account_id")?;
        let name = string(body, "name")?;
        if status != "CREATION_SUCCESS" || account.is_empty() || name.is_empty() {
            return Err(Error::new(
                400,
                "INVALID_NOTIFY",
                "A successful hosted account notification is required.",
            ));
        }
        let flow = self.claim(token, name, account, active)?;
        if flow.completed {
            return Ok(json!({"acknowledged":true}));
        }
        let client = self.client(&flow.project)?;
        ensure_active(active)?;
        let candidate = client
            .accounts()?
            .into_iter()
            .find(|a| a.id == account)
            .ok_or_else(|| {
                Error::new(
                    502,
                    "UNIPILE_ACCOUNT_NOT_FOUND",
                    "The notified account is not available in this workspace.",
                )
            })?;
        let channel = channel(&candidate.provider)
            .ok_or_else(|| Error::new(400, "INVALID_CHANNEL", "Unsupported account provider."))?;
        if !flow.providers.is_empty() && !flow.providers.contains(&candidate.provider) {
            return Err(Error::new(
                400,
                "UNIPILE_FLOW_MISMATCH",
                "The account provider does not match the hosted flow.",
            ));
        }
        let newly_bound = self.complete(&flow, account, channel, active)?;
        self.register_relations(client, &flow.project);
        Ok(
            json!({"bound":[{"accountId":account,"channel":channel,"provider":if newly_bound {candidate.provider.as_str()} else {""}}]}),
        )
    }
    fn disconnect(
        &self,
        project: &str,
        brand: &str,
        channel: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<Value> {
        if channel.is_empty() {
            return Err(Error::new(400, "MISSING_CHANNEL", "channel is required."));
        }
        let account = self
            .bound_account(project, brand, channel)?
            .ok_or_else(|| {
                Error::new(
                    404,
                    "SUBACCOUNT_NOT_FOUND",
                    "No connected account for that brand and channel.",
                )
            })?;
        let client = self.client(project)?;
        ensure_active(active)?;
        client.delete(&account)?;
        // Complete local reconciliation after a successful external delete even
        // when the caller disconnects; cancellation cannot retract that effect.
        self.clear_binding(project, brand, channel, &account)?;
        Ok(json!({"disconnected":true}))
    }
    fn register_relations(&self, client: Client, project: &str) {
        if self.config.signing_secret.is_empty() || self.config.public_base_url.is_empty() {
            return;
        }
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        use hmac::{Hmac, Mac};
        let segment =
            URL_SAFE_NO_PAD.encode(json!({"p":project,"c":"relations","k":"unipile"}).to_string());
        let Ok(mut mac) =
            Hmac::<sha2::Sha256>::new_from_slice(self.config.signing_secret.as_bytes())
        else {
            return;
        };
        mac.update(segment.as_bytes());
        let token = format!(
            "{segment}.{}",
            URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
        );
        let url = format!(
            "{}/v1/connectors/unipile/webhooks/relations?token={token}",
            self.config.public_base_url.trim_end_matches('/')
        );
        // Bound pending work without dropping another project's registration.
        // Each accepted job gets one attempt; saturation falls back to a bounded
        // inline attempt, rather than acknowledging a binding with no subscription.
        type Job = (Client, String, String);
        static QUEUE: std::sync::OnceLock<Option<std::sync::mpsc::SyncSender<Job>>> =
            std::sync::OnceLock::new();
        let queue = QUEUE.get_or_init(|| {
            let (sender, receiver) = std::sync::mpsc::sync_channel::<Job>(64);
            std::thread::Builder::new()
                .name("unipile-webhooks".into())
                .spawn(move || {
                    for (client, url, project) in receiver {
                        if let Err(error) = client.register_relations(&url) {
                            registration_failure(&project, &error);
                        }
                    }
                })
                .ok()
                .map(|_| sender)
        });
        let job = (client, url, project.to_owned());
        let fallback = match queue {
            Some(queue) => match queue.try_send(job) {
                Ok(()) => None,
                Err(
                    std::sync::mpsc::TrySendError::Full(job)
                    | std::sync::mpsc::TrySendError::Disconnected(job),
                ) => Some(job),
            },
            None => Some(job),
        };
        if let Some((client, url, project)) = fallback {
            if let Err(error) = client.register_relations(&url) {
                registration_failure(&project, &error);
            }
        }
    }
}
pub(crate) fn string<'a>(body: &'a Value, key: &str) -> Result<&'a str> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(""),
        Some(Value::String(v)) if v.len() <= INPUT_STRING_MAX_BYTES && !v.contains('\0') => Ok(v),
        _ => Err(Error::new(
            400,
            "INVALID_INPUT",
            "A request field is invalid.",
        )),
    }
}
pub(crate) fn cursor<'a>(body: &'a Value, key: &str) -> Result<&'a str> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(""),
        Some(Value::String(v)) if v.len() <= ACCEPTED_CURSOR_MAX_LEN && !v.contains('\0') => Ok(v),
        _ => Err(Error::new(
            400,
            "INVALID_INPUT",
            "A request field is invalid.",
        )),
    }
}

pub(crate) fn known_channel(channel: &str) -> bool {
    matches!(channel, "LINKEDIN" | "MAIL" | "MESSAGING")
}

fn registration_failure(project: &str, error: &Error) {
    eprintln!(
        "{}",
        json!({"event":"unipile_webhook_registration_failed","project_id":project,"connector":"unipile","code":error.code})
    );
}

pub(crate) fn ensure_active(active: &dyn Fn() -> bool) -> Result<()> {
    if active() {
        Ok(())
    } else {
        Err(Error::new(
            503,
            "SERVICE_BUSY",
            "The request is no longer active.",
        ))
    }
}

pub(crate) fn database_health(db: &Mutex<postgres::Client>) -> Option<bool> {
    match db.try_lock() {
        Ok(client) => Some(!client.is_closed()),
        Err(std::sync::TryLockError::WouldBlock) => None,
        Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
    }
}

#[cfg(test)]
mod health_tests {
    use super::*;

    #[test]
    fn cursor_input_uses_the_shared_generated_cursor_bound() {
        let at_bound = json!({"sinceCursor":"x".repeat(ACCEPTED_CURSOR_MAX_LEN)});
        assert!(cursor(&at_bound, "sinceCursor").is_ok());

        let over_bound = json!({
            "sinceCursor": "x".repeat(ACCEPTED_CURSOR_MAX_LEN + 1)
        });
        let error = cursor(&over_bound, "sinceCursor").unwrap_err();
        assert_eq!(error.code, "INVALID_INPUT");
    }

    #[test]
    #[ignore = "requires local PostgreSQL"]
    fn service_health_checks_every_private_client_without_waiting() {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let connect = || postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let store = Arc::new(Mutex::new(Store::new(
            connect(),
            appcall_store::LocalProvider::new(&[7; 32]).unwrap(),
        )));
        let credentials = Arc::new(StoreCredentials::new(store.clone()));
        let service = Service::new(
            connect(),
            credentials,
            Arc::new(ConfigGate::default()),
            Config::default(),
        )
        .unwrap();
        assert_eq!(service.database_health(), Some(true));
        let held = store.lock().unwrap();
        assert_eq!(service.database_health(), None);
        drop(held);
        let held = service.db.lock().unwrap();
        assert_eq!(service.database_health(), None);
        drop(held);
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _held = store.lock().unwrap();
            panic!("synthetic credential store poison");
        }));
        let _held = service.db.lock().unwrap();
        assert_eq!(service.database_health(), Some(false));
    }
}
