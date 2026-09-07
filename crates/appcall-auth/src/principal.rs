use crate::AuthError;
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Grant {
    All,
    Only(BTreeSet<String>),
}
impl Grant {
    pub fn permits(&self, value: &str) -> bool {
        match self {
            Self::All => true,
            Self::Only(values) => values.contains(value),
        }
    }
}

/// Never deserialize this type from a request. Only verifiers mint principals.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Principal {
    pub project_id: String,
    pub tenant_id: Option<String>,
    pub user_id: Option<String>,
    pub brand_id: Option<String>,
    pub allowed_brands: Grant,
    pub scopes: Grant,
}
impl Principal {
    pub fn project(project_id: impl Into<String>) -> Result<Self, AuthError> {
        let project_id = project_id.into();
        if !valid_id(&project_id) {
            return Err(AuthError::InvalidConfiguration);
        }
        Ok(Self {
            project_id,
            tenant_id: None,
            user_id: None,
            brand_id: None,
            allowed_brands: Grant::All,
            scopes: Grant::All,
        })
    }
}

pub(crate) fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && !value.chars().any(|c| c.is_control() || c.is_whitespace())
}
