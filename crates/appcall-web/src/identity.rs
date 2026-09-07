use crate::{AuthResult, Broker, Error, Session};
use appcall_auth::{
    AuthError, Authenticator, Header, JwtVerifier, MembershipVerifier, Principal, RequestContext,
};
use serde_json::json;
pub struct Identity<'a> {
    pub jwt: &'a JwtVerifier,
    pub memberships: &'a dyn MembershipVerifier,
    pub broker: &'a Broker,
}
impl Identity<'_> {
    pub fn authorize(&self, s: &Session, now: i64) -> Result<Principal, Error> {
        let claims = self.jwt.verify(&s.access_token, now).map_err(map)?;
        if claims.user_id != s.user_id {
            return Err(Error::Unauthorized);
        }
        let bearer = format!("Bearer {}", s.access_token);
        Authenticator::production(None, Some(self.jwt), Some(self.memberships))
            .map_err(map)?
            .authorize(
                &[
                    Header::new("Authorization", &bearer),
                    Header::new("X-Tenant-ID", &s.tenant_id),
                ],
                &RequestContext {
                    now_unix: now,
                    ..Default::default()
                },
            )
            .map_err(map)
    }
    pub async fn refresh(&self, s: &Session, now: i64) -> Result<(Session, Principal), Error> {
        match self.jwt.verify(&s.access_token, now) {
            Ok(_) => return Ok((s.clone(), self.authorize(s, now)?)),
            Err(AuthError::Expired) => {}
            Err(e) => return Err(map(e)),
        }
        if s.refresh_token.is_empty() {
            return Err(Error::Unauthorized);
        }
        let (access_token, refresh_token) = self.broker.refresh_tokens(&s.refresh_token).await?;
        let updated = Session {
            access_token,
            refresh_token,
            ..s.clone()
        };
        let principal = self.authorize(&updated, now)?;
        Ok((updated, principal))
    }
    pub fn establish(&self, result: AuthResult, now: i64) -> Result<Session, Error> {
        if result.mfa_required || result.refresh_token.is_empty() {
            return Err(Error::Unauthorized);
        }
        let claims = self.jwt.verify(&result.access_token, now).map_err(map)?;
        let member = result
            .memberships
            .iter()
            .find(|m| m.is_root)
            .or(result.memberships.first())
            .ok_or(Error::Forbidden)?;
        let session = Session {
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            user_id: claims.user_id,
            email: claims.email,
            tenant_id: member.tenant_id.clone(),
            tenant_name: member.tenant_name.clone(),
        };
        self.authorize(&session, now)?;
        Ok(session)
    }
    pub async fn logout(&self, s: &Session) -> Result<(), Error> {
        self.broker
            .call(
                reqwest::Method::POST,
                "/api/auth/logout",
                Some(s),
                Some(json!({"refreshToken":s.refresh_token})),
            )
            .await
            .map(|_| ())
    }
}
fn map(e: AuthError) -> Error {
    match e {
        AuthError::Unavailable => Error::Unavailable,
        AuthError::Forbidden => Error::Forbidden,
        _ => Error::Unauthorized,
    }
}
