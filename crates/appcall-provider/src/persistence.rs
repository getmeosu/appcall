use crate::*;
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime};
pub(crate) struct Flow {
    pub id: String,
    pub project: String,
    pub brand: String,
    pub providers: Vec<String>,
    pub completed: bool,
}
fn token_hash(token: &str) -> String {
    Sha256::digest(token.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
// Match the Go FNV-1a advisory lock so both runtimes serialize during rollout.
fn lock_key(project: &str) -> i64 {
    let mut hash = 14695981039346656037u64;
    for byte in project
        .bytes()
        .chain([0])
        .chain(b"unipile".iter().copied())
        .chain([0])
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1099511628211)
    }
    hash as i64
}
impl Service {
    pub(crate) fn check_gate(
        &self,
        project: &str,
        brand: &str,
        channel: &str,
        limit: i64,
    ) -> Result<()> {
        let used:i64=self.db.lock().map_err(|_|Error::database())?.query_one("SELECT count(*) FROM provider_subaccounts WHERE project_id=$1 AND connector='unipile' AND status='connected'",&[&project])?.get(0);
        audit_gate(project, brand, channel, limit, used);
        if limit <= 0 || used >= limit {
            return Err(Error::denied(limit, used));
        }
        Ok(())
    }
    pub(crate) fn create_flow(
        &self,
        project: &str,
        brand: &str,
        providers: &[String],
        active: &dyn Fn() -> bool,
    ) -> Result<(String, String, String)> {
        let id = random_id()?;
        let token = random_id()?;
        let expires = SystemTime::now() + Duration::from_secs(900);
        let mut db = self.db.lock().map_err(|_| Error::database())?;
        ensure_active(active)?;
        let mut tx = db.transaction()?;
        tx.execute("WITH expired AS (SELECT id FROM unipile_hosted_flows WHERE expires_at<=now() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED) DELETE FROM unipile_hosted_flows f USING expired WHERE f.id=expired.id",&[])?;
        tx.execute("INSERT INTO unipile_hosted_flows(id,token_hash,project_id,brand_id,providers,expires_at)VALUES($1,$2,$3,$4,$5,$6)",&[&id,&token_hash(&token),&project,&brand,&providers,&expires])?;
        ensure_active(active)?;
        tx.commit()?;
        Ok((
            id,
            token,
            DateTime::<Utc>::from(expires).to_rfc3339_opts(SecondsFormat::Millis, true),
        ))
    }
    pub(crate) fn claim(
        &self,
        token: &str,
        name: &str,
        account: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<Flow> {
        if token.is_empty() || token.len() > 512 || name.is_empty() || account.is_empty() {
            return Err(Error::unauthorized());
        }
        let mut db = self.db.lock().map_err(|_| Error::database())?;
        ensure_active(active)?;
        let mut tx = db.transaction()?;
        let row=tx.query_opt("UPDATE unipile_hosted_flows SET account_id=$3 WHERE token_hash=$1 AND id=$2 AND expires_at>now() AND (account_id IS NULL OR account_id=$3) RETURNING id,project_id,brand_id,providers,completed",&[&token_hash(token),&name,&account])?.ok_or_else(Error::unauthorized)?;
        ensure_active(active)?;
        tx.commit()?;
        Ok(Flow {
            id: row.get(0),
            project: row.get(1),
            brand: row.get(2),
            providers: row.get(3),
            completed: row.get(4),
        })
    }
    pub(crate) fn complete(
        &self,
        flow: &Flow,
        account: &str,
        channel: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<bool> {
        let mut db = self.db.lock().map_err(|_| Error::database())?;
        let mut tx = db.transaction()?;
        ensure_active(active)?;
        // Match Go ordering: flow row, project cap lock, then binding row.
        let row = tx.query_opt(
            "SELECT completed FROM unipile_hosted_flows WHERE id=$1 AND project_id=$2 AND brand_id=$3 AND account_id=$4 AND expires_at>now() FOR UPDATE",
            &[&flow.id, &flow.project, &flow.brand, &account],
        )?.ok_or_else(Error::unauthorized)?;
        if row.get::<_, bool>(0) {
            tx.commit()?;
            return Ok(false);
        }
        tx.query_one(
            "SELECT pg_advisory_xact_lock($1)",
            &[&lock_key(&flow.project)],
        )?;
        ensure_active(active)?;
        let owner = tx.query_opt(
            "SELECT external_account_id,channel FROM provider_subaccounts WHERE project_id=$1 AND connector='unipile' AND provider_account_id=$2 FOR UPDATE",
            &[&flow.project, &account],
        )?;
        let known = owner.is_some();
        if let Some(owner) = owner {
            if owner.get::<_, String>(0) != flow.brand || owner.get::<_, String>(1) != channel {
                return Err(Error::new(
                    409,
                    "UNIPILE_ACCOUNT_ALREADY_BOUND",
                    "The account is already bound.",
                ));
            }
            // A fresh flow for an already-owned account consumes correlation without
            // claiming new health evidence or changing a needs_reconnect status.
        } else {
            let limit = self
                .gate
                .limit(&flow.project)
                .map_err(|_| Error::denied(0, 0))?;
            let used: i64 = tx.query_one(
                "SELECT count(*) FROM provider_subaccounts WHERE project_id=$1 AND connector='unipile' AND status='connected'",
                &[&flow.project],
            )?.get(0);
            audit_gate(&flow.project, &flow.brand, channel, limit, used);
            // This is also the handler's second gate: Go checks current total
            // headroom before linking a newly notified provider account.
            if limit <= 0 || used >= limit {
                return Err(Error::denied(limit, used));
            }
            ensure_active(active)?;
            tx.execute(
                "INSERT INTO provider_subaccounts(id,project_id,external_account_id,connector,channel,provider_account_id,status)VALUES($1,$2,$3,'unipile',$4,$5,'connected') ON CONFLICT(project_id,external_account_id,connector,channel) DO UPDATE SET provider_account_id=EXCLUDED.provider_account_id,status='connected',secret_ref_id=NULL,updated_at=now()",
                &[&random_id()?, &flow.project, &flow.brand, &channel, &account],
            )?;
        }
        tx.execute(
            "UPDATE unipile_hosted_flows SET completed=true WHERE id=$1",
            &[&flow.id],
        )?;
        ensure_active(active)?;
        tx.commit()?;
        Ok(!known)
    }
    pub(crate) fn bound_account(
        &self,
        project: &str,
        brand: &str,
        channel: &str,
    ) -> Result<Option<String>> {
        Ok(self.db.lock().map_err(|_|Error::database())?.query_opt("SELECT provider_account_id FROM provider_subaccounts WHERE project_id=$1 AND external_account_id=$2 AND connector='unipile' AND channel=$3",&[&project,&brand,&channel])?.map(|r|r.get(0)))
    }
    pub(crate) fn clear_binding(
        &self,
        project: &str,
        brand: &str,
        channel: &str,
        expected: &str,
    ) -> Result<()> {
        let mut db = self.db.lock().map_err(|_| Error::database())?;
        let mut tx = db.transaction()?;
        tx.query_one("SELECT pg_advisory_xact_lock($1)", &[&lock_key(project)])?;
        tx.execute("DELETE FROM provider_subaccounts WHERE project_id=$1 AND external_account_id=$2 AND connector='unipile' AND channel=$3 AND provider_account_id=$4",&[&project,&brand,&channel,&expected])?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn list(&self, project: &str, brand: &str, channel: Option<&str>) -> Result<Value> {
        let rows=self.db.lock().map_err(|_|Error::database())?.query("SELECT provider_account_id,channel FROM provider_subaccounts WHERE project_id=$1 AND external_account_id=$2 AND connector='unipile' AND channel IN ('LINKEDIN','MAIL','MESSAGING') AND ($3::text IS NULL OR channel=$3) ORDER BY CASE channel WHEN 'LINKEDIN' THEN 1 WHEN 'MAIL' THEN 2 ELSE 3 END",&[&project,&brand,&channel])?;
        let bound:Vec<Value>=rows.iter().map(|r|json!({"accountId":r.get::<_,String>(0),"channel":r.get::<_,String>(1),"provider":""})).collect();
        Ok(json!({"bound":bound}))
    }
    pub(crate) fn accepted(&self, project: &str, brand: &str, cursor: &str) -> Result<Value> {
        let since: SystemTime = if cursor.is_empty() {
            SystemTime::UNIX_EPOCH
        } else {
            DateTime::parse_from_rfc3339(cursor)
                .map_err(|_| {
                    Error::new(
                        400,
                        "INVALID_CURSOR",
                        "sinceCursor must be an RFC3339 timestamp.",
                    )
                })?
                .into()
        };
        let rows=self.db.lock().map_err(|_|Error::database())?.query("SELECT provider_member_id,accepted_at FROM linkedin_accepted_relations WHERE project_id=$1 AND ($2='' OR external_account_id=$2) AND accepted_at>$3 ORDER BY accepted_at ASC,provider_member_id ASC LIMIT 200",&[&project,&brand,&since])?;
        let mut next = cursor.to_owned();
        let accepted: Vec<Value> = rows
            .iter()
            .map(|r| {
                let time: SystemTime = r.get(1);
                next = DateTime::<Utc>::from(time).to_rfc3339_opts(SecondsFormat::AutoSi, true);
                json!({"memberId":r.get::<_,String>(0),"acceptedAt":next})
            })
            .collect();
        Ok(json!({"accepted":accepted,"nextCursor":next}))
    }
    pub(crate) fn relations(
        &self,
        project: &str,
        account: &str,
        member: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<Value> {
        if account.is_empty() || member.is_empty() {
            return Ok(json!({"ok":true}));
        }
        // A single statement binds ingestion to current ownership, avoiding a read/write race.
        let mut db = self.db.lock().map_err(|_| Error::database())?;
        ensure_active(active)?;
        let mut tx = db.transaction()?;
        tx.execute("INSERT INTO linkedin_accepted_relations(project_id,external_account_id,provider_member_id) SELECT project_id,external_account_id,$3 FROM provider_subaccounts WHERE project_id=$1 AND connector='unipile' AND provider_account_id=$2 ON CONFLICT DO NOTHING",&[&project,&account,&member])?;
        ensure_active(active)?;
        tx.commit()?;
        Ok(json!({"ok":true}))
    }
}

fn audit_gate(project: &str, brand: &str, channel: &str, limit: i64, used: i64) {
    let allowed = limit > 0 && used < limit;
    eprintln!(
        "{}",
        json!({"event":"account_link_gate_decision","project_id":project,"external_account_id":brand,"connector":"unipile","channel":channel,"limit":limit,"used":used,"allowed":allowed,"reason":if allowed{""}else if limit>0{"QUOTA_EXCEEDED"}else{"NOT_ENTITLED"}})
    );
}
