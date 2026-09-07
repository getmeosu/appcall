use crate::{AccessClaims, ApiKeyVerifier, AuthError, Grant, JwtVerifier, Principal};
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};

#[derive(Clone, Copy)]
pub struct Header<'a> {
    pub name: &'a str,
    pub value: &'a str,
}
impl<'a> Header<'a> {
    pub fn new(name: &'a str, value: &'a str) -> Self {
        Self { name, value }
    }
}
#[derive(Default)]
pub struct RequestContext<'a> {
    pub now_unix: i64,
    pub expected_project: Option<&'a str>,
    pub required_brand: Option<&'a str>,
    pub require_brand: bool,
    pub required_scope: Option<&'a str>,
    /// Only authenticated upstream callbacks/session middleware may populate this.
    pub trusted_principal: Option<&'a Principal>,
}
#[derive(Debug, Clone)]
pub struct Membership {
    pub tenant_id: String,
    pub allowed_brands: Grant,
    pub scopes: Grant,
}
/// Must check current membership, active tenant/user and access-token revocation.
/// token_hash is Go-compatible base64(SHA256(raw JWT)), never the bearer itself.
pub trait MembershipVerifier: Send + Sync {
    fn verify_membership(
        &self,
        claims: &AccessClaims,
        tenant_id: &str,
        token_hash: &str,
    ) -> Result<Option<Membership>, AuthError>;
}

pub struct Authenticator<'a> {
    api_keys: Option<&'a dyn ApiKeyVerifier>,
    jwt: Option<&'a JwtVerifier>,
    memberships: Option<&'a dyn MembershipVerifier>,
    development: Option<Principal>,
}
impl<'a> Authenticator<'a> {
    pub fn production(
        api_keys: Option<&'a dyn ApiKeyVerifier>,
        jwt: Option<&'a JwtVerifier>,
        memberships: Option<&'a dyn MembershipVerifier>,
    ) -> Result<Self, AuthError> {
        if (api_keys.is_none() && jwt.is_none()) || (jwt.is_some() && memberships.is_none()) {
            return Err(AuthError::InvalidConfiguration);
        }
        Ok(Self {
            api_keys,
            jwt,
            memberships,
            development: None,
        })
    }
    pub fn for_development(principal: Principal) -> Self {
        Self {
            api_keys: None,
            jwt: None,
            memberships: None,
            development: Some(principal),
        }
    }
    pub fn authorize(
        &self,
        headers: &[Header<'_>],
        context: &RequestContext<'_>,
    ) -> Result<Principal, AuthError> {
        if headers.len() > 128
            || headers
                .iter()
                .map(|h| h.name.len().saturating_add(h.value.len()))
                .sum::<usize>()
                > 32768
        {
            return Err(AuthError::InvalidHeaders);
        }
        let api_key = unique_header(headers, "X-API-Key")?;
        let authorization = unique_header(headers, "Authorization")?;
        let tenant = unique_header(headers, "X-Tenant-ID")?;
        let header_brand = unique_header(headers, "X-External-Account-Id")?;
        if api_key.is_some() && authorization.is_some() {
            return Err(AuthError::InvalidHeaders);
        }
        let mut principal = if let Some(trusted) = context.trusted_principal {
            trusted.clone()
        } else if let Some(key) = api_key {
            self.api_keys
                .ok_or(AuthError::Unauthorized)?
                .verify_api_key(key)?
                .ok_or(AuthError::Unauthorized)?
        } else if let Some(authorization) = authorization {
            let token = authorization
                .strip_prefix("Bearer ")
                .ok_or(AuthError::Unauthorized)?;
            let claims = self
                .jwt
                .ok_or(AuthError::Unauthorized)?
                .verify(token, context.now_unix)?;
            let tenant = tenant
                .filter(|id| crate::principal::valid_id(id))
                .ok_or(AuthError::Forbidden)?;
            let hash = STANDARD.encode(Sha256::digest(token.as_bytes()));
            let membership = self
                .memberships
                .ok_or(AuthError::InvalidConfiguration)?
                .verify_membership(&claims, tenant, &hash)?
                .ok_or(AuthError::Forbidden)?;
            if membership.tenant_id != tenant {
                return Err(AuthError::Forbidden);
            }
            let mut p = Principal::project(format!("proj_{tenant}"))?;
            p.tenant_id = Some(tenant.into());
            p.user_id = Some(claims.user_id);
            p.allowed_brands = membership.allowed_brands;
            p.scopes = membership.scopes;
            p
        } else {
            self.development.clone().ok_or(AuthError::Unauthorized)?
        };
        if !crate::principal::valid_id(&principal.project_id) {
            return Err(AuthError::Forbidden);
        }
        if context
            .expected_project
            .is_some_and(|p| p != principal.project_id)
        {
            return Err(AuthError::Forbidden);
        }
        if let (Some(route), Some(header)) = (context.required_brand, header_brand) {
            if route != header {
                return Err(AuthError::Forbidden);
            }
        }
        let selected = context
            .required_brand
            .or(header_brand)
            .or(principal.brand_id.as_deref());
        if context.require_brand && selected.is_none() {
            return Err(AuthError::Forbidden);
        }
        if let Some(brand) = selected {
            if !crate::principal::valid_id(brand)
                || !principal.allowed_brands.permits(brand)
                || principal
                    .brand_id
                    .as_deref()
                    .is_some_and(|bound| bound != brand)
            {
                return Err(AuthError::Forbidden);
            }
            principal.brand_id = Some(brand.into());
        } else if principal.allowed_brands != Grant::All {
            return Err(AuthError::Forbidden);
        }
        if context
            .required_scope
            .is_some_and(|scope| !principal.scopes.permits(scope))
        {
            return Err(AuthError::Forbidden);
        }
        Ok(principal)
    }
}

fn unique_header<'a>(headers: &[Header<'a>], name: &str) -> Result<Option<&'a str>, AuthError> {
    let mut found = None;
    for header in headers.iter().filter(|h| h.name.eq_ignore_ascii_case(name)) {
        if found.is_some()
            || header.value.is_empty()
            || header.value.chars().any(|c| c.is_control() || c == ',')
        {
            return Err(AuthError::InvalidHeaders);
        }
        found = Some(header.value);
    }
    Ok(found)
}
