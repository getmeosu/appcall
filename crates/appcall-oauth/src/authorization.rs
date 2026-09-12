use crate::lifecycle::{persistence, random_id, Pending};
use crate::*;
use appcall_store::{Scope, Status};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;
pub struct StartResult {
    pub authorization_url: String,
}
fn digest(state: &str) -> String {
    BASE64.encode(Sha256::digest(state.as_bytes()))
}
impl Lifecycle {
    pub fn start(&self, scope: &Scope, id: &str, connector: &str) -> Result<StartResult> {
        self.start_checked(scope, id, connector, &|| true)
    }
    /// Cancellation is checked after contention and before committing authorization state.
    pub fn start_checked(
        &self,
        scope: &Scope,
        id: &str,
        connector: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<StartResult> {
        if !active() {
            return Err(Error::ConnectionUnavailable);
        }
        let spec = self.spec(connector)?;
        let app = self.apps.get(connector).ok_or(Error::NotConfigured)?;
        let redirect = reqwest::Url::parse(&app.redirect_uri).map_err(|_| Error::InvalidInput)?;
        if redirect.scheme() != "https"
            || redirect.host_str().is_none()
            || !redirect.username().is_empty()
            || redirect.password().is_some()
            || redirect.fragment().is_some()
            || app.client_id.is_empty()
        {
            return Err(Error::InvalidInput);
        }
        let mut url = reqwest::Url::parse(&spec.authorize_url).map_err(|_| Error::InvalidInput)?;
        let reserved = [
            "client_id",
            "client_secret",
            "redirect_uri",
            "state",
            "response_type",
            "scope",
            "code_challenge",
            "code_challenge_method",
        ];
        if spec
            .extra_auth_params
            .keys()
            .any(|key| reserved.contains(&key.as_str()))
            || url
                .query_pairs()
                .any(|(key, _)| reserved.contains(&key.as_ref()))
        {
            return Err(Error::InvalidInput);
        }
        let verifier = Zeroizing::new(if spec.pkce {
            random_id("")?
        } else {
            String::new()
        });
        // This random reference also makes non-PKCE states unique per attempt.
        let pkce_ref = random_id("sec_")?;
        let attempt = random_id("auth_")?;
        let expires = chrono::DateTime::from_timestamp(
            (self.now)().checked_add(600).ok_or(Error::InvalidInput)?,
            0,
        )
        .ok_or(Error::InvalidInput)?
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let state=self.store.lock().map_err(|_|Error::Persistence)?.transaction(|tx|{
   if !active() { return Ok(Err(Error::ConnectionUnavailable)); }
   let connection=tx.lock_connection(scope,id)?;if connection.connector!=connector{return Ok(Err(Error::ConnectionUnavailable))}
   if !active() { return Ok(Err(Error::ConnectionUnavailable)); }
   let claims=StateClaims{project_id:connection.project_id.clone(),connector:connector.into(),connection_id:id.into(),redirect_uri:app.redirect_uri.clone(),expires_at:expires.clone(),pkce_ref:pkce_ref.clone()};
   let state=match self.signer.sign(&claims){Ok(state)=>state,Err(error)=>return Ok(Err(error))};
   if spec.pkce{tx.store_secret(&connection.project_id,&pkce_ref,&format!("oauth_pkce_{id}"),verifier.as_bytes())?;}
   let pkce_secret_ref_id=spec.pkce.then_some(pkce_ref.as_str());
   tx.client().execute("INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state,state_digest,pkce_secret_ref_id) VALUES($1,$2,$3,$4,'authorization','authorizing',$5,$6) ON CONFLICT(project_id,connection_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,secret_ref_id=EXCLUDED.secret_ref_id,operation='authorization',state='authorizing',state_digest=EXCLUDED.state_digest,pkce_secret_ref_id=EXCLUDED.pkce_secret_ref_id,created_at=now(),updated_at=now()",&[&connection.project_id,&id,&attempt,&connection.secret_ref_id,&digest(&state),&pkce_secret_ref_id])?;
   tx.update_status(scope,id,Status::Authorizing)?;
   if !active() { return Err(appcall_store::Error::Conflict); }
   Ok(Ok(state))
  }).map_err(persistence)??;
        let scopes = self
            .registry
            .connector(connector)
            .map_err(|_| Error::Unsupported)?
            .manifest()
            .auth
            .scopes
            .join(" ");
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("client_id", &app.client_id)
                .append_pair("redirect_uri", &app.redirect_uri)
                .append_pair("response_type", "code")
                .append_pair("state", &state);
            if !scopes.is_empty() {
                query.append_pair("scope", &scopes);
            }
            for (key, value) in &spec.extra_auth_params {
                query.append_pair(key, value);
            }
            if spec.pkce {
                query
                    .append_pair(
                        "code_challenge",
                        &BASE64.encode(Sha256::digest(verifier.as_bytes())),
                    )
                    .append_pair("code_challenge_method", "S256");
            }
        }
        Ok(StartResult {
            authorization_url: url.into(),
        })
    }
    pub fn callback(
        &self,
        connector: &str,
        project: Option<&str>,
        code: &str,
        state: &str,
    ) -> Result<ResolvedCredentials> {
        self.callback_checked(connector, project, code, state, &|| true)
    }
    pub fn callback_checked(
        &self,
        connector: &str,
        project: Option<&str>,
        code: &str,
        state: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<ResolvedCredentials> {
        if !active() {
            return Err(Error::ConnectionUnavailable);
        }
        if code.is_empty() || code.len() > 4096 {
            return Err(Error::InvalidInput);
        }
        let spec = self.spec(connector)?;
        let app = self.apps.get(connector).ok_or(Error::NotConfigured)?;
        let claims = self.signer.verify(
            state,
            &ExpectedState {
                project_id: project,
                connector,
                redirect_uri: &app.redirect_uri,
            },
            (self.now)(),
        )?;
        let scope = Scope::new(&claims.project_id, None).map_err(persistence)?;
        let (pending,verifier)=self.store.lock().map_err(|_|Error::Persistence)?.transaction(|tx|{
   if !active() { return Ok(Err(Error::ConnectionUnavailable)); }
   let connection=tx.lock_connection(&scope,&claims.connection_id)?;
   if !active() { return Ok(Err(Error::ConnectionUnavailable)); }
   if connection.connector!=connector||connection.status!=Status::Authorizing{return Ok(Err(Error::ConnectionUnavailable))}
   let row=tx.client().query_opt("SELECT attempt_id,secret_ref_id,state,state_digest,operation,pkce_secret_ref_id FROM oauth_refresh_intents WHERE project_id=$1 AND connection_id=$2 FOR UPDATE",&[&connection.project_id,&connection.id])?;
   let Some(row)=row else{return Ok(Err(Error::ConnectionUnavailable))};
   if row.get::<_,String>("state")!="authorizing"||row.get::<_,String>("operation")!="authorization"||row.get::<_,String>("state_digest")!=digest(state)||row.get::<_,String>("secret_ref_id")!=connection.secret_ref_id{return Ok(Err(Error::StateBinding))}
   let persisted_pkce_ref=row.get::<_,Option<String>>("pkce_secret_ref_id");
   if spec.pkce&&persisted_pkce_ref.is_some_and(|reference|reference!=claims.pkce_ref){return Ok(Err(Error::InvalidState))}
   let verifier=if spec.pkce{if tx.secret_kind(&connection.project_id,&claims.pkce_ref)?!=format!("oauth_pkce_{}",connection.id){return Ok(Err(Error::InvalidState))}let raw=tx.load_secret(&connection.project_id,&claims.pkce_ref)?;match std::str::from_utf8(raw.as_bytes()){Ok(value)=>Zeroizing::new(value.to_owned()),Err(_)=>return Ok(Err(Error::InvalidState))}}else{Zeroizing::new(String::new())};
   if !active() { return Ok(Err(Error::ConnectionUnavailable)); }
   let attempt:String=row.get("attempt_id");tx.client().execute("UPDATE oauth_refresh_intents SET state='dispatched',updated_at=now() WHERE project_id=$1 AND connection_id=$2 AND attempt_id=$3",&[&connection.project_id,&connection.id,&attempt])?;tx.update_status(&scope,&connection.id,Status::Degraded)?;
   if !active() { return Err(appcall_store::Error::Conflict); }
   Ok(Ok((Pending{connection,attempt,spec:spec.clone(),tokens:None},verifier)))
  }).map_err(persistence)??;
        let result = if active() {
            self.provider
                .exchange(&spec, app, code, &verifier, (self.now)())
        } else {
            Err(Error::OutcomeUnknown)
        };
        self.finish(&scope, pending, result)
    }
}
