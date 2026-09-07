use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Invalid,
    InvalidKey,
    Crypto,
    NotFound,
    Conflict,
    Storage,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "store {:?}", self)
    }
}
impl std::error::Error for Error {}
impl From<postgres::Error> for Error {
    fn from(e: postgres::Error) -> Self {
        if e.code() == Some(&postgres::error::SqlState::UNIQUE_VIOLATION) {
            Self::Conflict
        } else {
            Self::Storage
        }
    }
}
macro_rules! strings {($name:ident {$($variant:ident => $value:literal),+})=>{
#[derive(Debug,Clone,Copy,PartialEq,Eq,Serialize,Deserialize)]pub enum $name {$(#[serde(rename=$value)]$variant),+}
impl $name {pub fn as_str(self)->&'static str{match self{$(Self::$variant=>$value),+}} fn parse(s:&str)->Result<Self,Error>{match s{$($value=>Ok(Self::$variant)),+, _=>Err(Error::Invalid)}}}
}}
strings!(AuthType {OAuth2=>"oauth2",ApiKey=>"api_key",ExternalBearer=>"external_bearer"});
strings!(Status {Authorizing=>"authorizing",Active=>"active",Disconnected=>"disconnected",Degraded=>"degraded"});
strings!(TestStatus {Unknown=>"unknown",Passed=>"passed",Failed=>"failed"});
strings!(CredentialOwner {Brand=>"brand",Platform=>"platform"});
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Connection {
    #[serde(rename = "ID")]
    pub id: String,
    #[serde(rename = "ProjectID")]
    pub project_id: String,
    #[serde(rename = "Connector")]
    pub connector: String,
    #[serde(rename = "AuthType")]
    pub auth_type: AuthType,
    #[serde(rename = "Status")]
    pub status: Status,
    #[serde(rename = "SecretRefID")]
    pub secret_ref_id: String,
    #[serde(rename = "LastTestStatus")]
    pub last_test_status: TestStatus,
    #[serde(rename = "ExternalAccountID")]
    pub external_account_id: String,
    #[serde(rename = "CredentialOwner")]
    pub credential_owner: CredentialOwner,
}
impl Connection {
    pub(crate) fn row(r: postgres::Row) -> Result<Self, Error> {
        Ok(Self {
            id: r.get("id"),
            project_id: r.get("project_id"),
            connector: r.get("connector"),
            auth_type: AuthType::parse(r.get("auth_type"))?,
            status: Status::parse(r.get("status"))?,
            secret_ref_id: r
                .get::<_, Option<String>>("secret_ref_id")
                .unwrap_or_default(),
            last_test_status: TestStatus::parse(r.get("last_test_status"))?,
            external_account_id: r
                .get::<_, Option<String>>("external_account_id")
                .unwrap_or_default(),
            credential_owner: CredentialOwner::parse(r.get("credential_owner"))?,
        })
    }
}
#[derive(Debug, Clone)]
pub struct Scope {
    pub(crate) project: String,
    pub(crate) account: String,
}
impl Scope {
    pub fn new(project: &str, account: Option<&str>) -> Result<Self, Error> {
        if project.is_empty() {
            return Err(Error::Invalid);
        }
        Ok(Self {
            project: project.into(),
            account: account.unwrap_or_default().into(),
        })
    }
}
