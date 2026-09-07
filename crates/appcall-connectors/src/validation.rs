use crate::{Error, Manifest, OperationKind, Result, SetupConfig, SetupField};
use std::collections::BTreeSet;
use url::Url;

pub const CATEGORIES: &[&str] = &[
    "messaging",
    "email-marketing",
    "crm",
    "ats-recruitment",
    "ads",
    "productivity",
    "dev-tools",
    "ecommerce",
    "payments",
    "accounting",
    "banking-data",
    "scheduling",
    "forms",
    "social",
    "utility",
];
fn require(ok: bool, field: &'static str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(field))
    }
}
fn key(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
}
fn fields_valid(fields: &[SetupField]) -> bool {
    fields
        .iter()
        .all(|f| !f.key.trim().is_empty() && !f.label.trim().is_empty())
}

impl Manifest {
    pub fn validate(&self) -> Result<()> {
        require(key(&self.key), "key")?;
        require(!self.name.trim().is_empty(), "name")?;
        require(!self.version.trim().is_empty(), "version")?;
        require(self.runtime == "bun", "runtime")?;
        require(
            matches!(self.visibility.as_str(), "" | "public" | "internal"),
            "visibility",
        )?;
        require(!self.auth.type_.trim().is_empty(), "auth.type")?;
        self.auth.setup.validate(&self.auth.type_)?;
        match self.network.egress.as_str() {
            "none" => require(
                self.network.allowed_hosts.is_empty(),
                "network.allowedHosts",
            )?,
            "" => {
                require(
                    !self.network.allowed_hosts.is_empty(),
                    "network.allowedHosts",
                )?;
                for host in &self.network.allowed_hosts {
                    require(valid_host(host), "network.allowedHosts")?;
                }
            }
            _ => return Err(Error::invalid("network.egress")),
        }
        if let Some(oauth) = &self.auth.oauth {
            require(
                matches!(oauth.client_auth.as_str(), "" | "body" | "basic"),
                "auth.oauth.clientAuth",
            )?;
            require(
                matches!(oauth.version.as_str(), "" | "1.0a"),
                "auth.oauth.version",
            )?;
            let hosts: BTreeSet<String> = self
                .network
                .allowed_hosts
                .iter()
                .map(|h| h.trim().to_lowercase())
                .collect();
            for endpoint in [&oauth.authorize_url, &oauth.token_url] {
                let parsed = Url::parse(endpoint).map_err(|_| Error::invalid("auth.oauth.url"))?;
                require(
                    parsed.scheme() == "https"
                        && parsed
                            .host_str()
                            .is_some_and(|h| hosts.contains(&h.to_lowercase())),
                    "auth.oauth.url",
                )?;
            }
        }
        require(!self.operations.is_empty(), "operations")?;
        for (name, op) in &self.operations {
            require(key(name), "operations.key")?;
            require(op.kind != OperationKind::Unknown, "operations.kind")?;
            require(
                op.timeout_ms > 0 && op.max_input_bytes > 0 && op.max_response_bytes > 0,
                "operations.limits",
            )?;
            require(
                matches!(
                    op.side_effect.as_str(),
                    "" | "read" | "write" | "destructive"
                ),
                "operations.sideEffect",
            )?;
        }
        require(!self.models.is_empty(), "models")?;
        require(
            self.categories
                .iter()
                .all(|c| CATEGORIES.contains(&c.as_str())),
            "categories",
        )
    }
}
impl SetupConfig {
    pub fn validate(&self, auth_type: &str) -> Result<()> {
        if self.mode.is_empty() {
            return require(self.derive.is_empty(), "auth.setup.derive");
        }
        require(
            matches!(self.mode.as_str(), "oauth2" | "api_key" | "external_bearer"),
            "auth.setup.mode",
        )?;
        if auth_type == "api_key" && self.mode == "api_key" {
            require(
                !self.fields.is_empty() || !self.routes.is_empty(),
                "auth.setup.fields",
            )?;
        }
        require(fields_valid(&self.fields), "auth.setup.fields")?;
        if !self.docs_url.trim().is_empty() {
            let url = Url::parse(self.docs_url.trim())
                .map_err(|_| Error::invalid("auth.setup.docsUrl"))?;
            require(
                url.scheme() == "https" && url.host_str().is_some(),
                "auth.setup.docsUrl",
            )?;
        }
        let mut routes = BTreeSet::new();
        let mut fields: BTreeSet<&str> = self.fields.iter().map(|f| f.key.as_str()).collect();
        for route in &self.routes {
            require(
                !route.id.trim().is_empty() && routes.insert(&route.id),
                "auth.setup.routes.id",
            )?;
            require(!route.label.trim().is_empty(), "auth.setup.routes.label")?;
            require(
                !route.fields.is_empty() && fields_valid(&route.fields),
                "auth.setup.routes.fields",
            )?;
            fields.extend(route.fields.iter().map(|f| f.key.as_str()));
        }
        for d in &self.derive {
            require(
                !d.field.trim().is_empty() && !fields.contains(d.field.as_str()),
                "auth.setup.derive.field",
            )?;
            require(
                d.kind == "basic" && d.from.len() == 2,
                "auth.setup.derive.kind",
            )?;
            require(
                d.from
                    .iter()
                    .all(|f| !f.trim().is_empty() && fields.contains(f.as_str())),
                "auth.setup.derive.from",
            )?;
        }
        Ok(())
    }
}

fn valid_host(entry: &str) -> bool {
    let host = entry.trim().to_lowercase();
    if let Some(inner) = host.strip_prefix("{{").and_then(|h| h.strip_suffix("}}")) {
        let field = inner.trim();
        return !field.is_empty()
            && field
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"_.$-".contains(&c));
    }
    if host.is_empty() || host.contains(['/', ':']) {
        return false;
    }
    let wildcard = host.starts_with("*.");
    let suffix = host.strip_prefix("*.").unwrap_or(&host);
    let labels: Vec<_> = suffix.split('.').collect();
    (!wildcard || labels.len() >= 2)
        && labels.iter().all(|l| {
            !l.is_empty()
                && l.len() <= 63
                && l.as_bytes()[0].is_ascii_alphanumeric()
                && l.as_bytes()[l.len() - 1].is_ascii_alphanumeric()
                && l.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        })
}
