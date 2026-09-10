use crate::policy::{channel, linkedin_class};
use crate::*;
use chrono::{Datelike, Utc};
use postgres::Transaction;

#[derive(Clone)]
pub struct PgPolicy {
    repository: PgActionRepository,
    config: PolicyConfig,
}
impl PgPolicy {
    pub fn new(repository: PgActionRepository, config: PolicyConfig) -> Result<Self> {
        if config.send_cost_micros < 0 {
            return Err(unavailable());
        }
        resolve_entitlements(None, &config.defaults)?;
        Ok(Self { repository, config })
    }
}
fn unavailable() -> ActionError {
    ActionError::new("CONNECTOR_UNAVAILABLE")
}
fn entitlements(
    tx: &mut Transaction<'_>,
    project: &str,
    config: &PolicyConfig,
) -> Result<Entitlements> {
    let row = tx
        .query_opt(
            "SELECT plan_key,status,overrides FROM project_plans WHERE project_id=$1",
            &[&project],
        )
        .map_err(|_| unavailable())?;
    let record = row.as_ref().map(|r| {
        (
            r.get::<_, &str>(0),
            r.get::<_, &str>(1),
            r.get::<_, Value>(2),
        )
    });
    resolve_entitlements(record, &config.defaults)
}
/// Serialize all action-call capacity transitions for one project and UTC
/// month. The month is part of the lock key so an action settling after UTC
/// midnight cannot race a new month's admission.
pub(crate) fn usage_quota_lock(tx: &mut Transaction<'_>, project: &str, month: &str) -> Result<()> {
    let identity = serde_json::to_string(&["quota", project, month, "action_call"])
        .map_err(|_| unavailable())?;
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        &[&identity],
    )
    .map_err(|_| unavailable())?;
    Ok(())
}

fn utc_month(tx: &mut Transaction<'_>) -> Result<String> {
    tx.query_one("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM')", &[])
        .map(|row| row.get(0))
        .map_err(|_| unavailable())
}

fn expire_pending_quota(tx: &mut Transaction<'_>, project: &str, month: &str) -> Result<()> {
    tx.execute(
        "UPDATE action_usage_reservations
            SET state='released', released_at=now()
          WHERE project_id=$1 AND month=$2 AND state='pending' AND expires_at<=now()",
        &[&project, &month],
    )
    .map_err(|_| unavailable())?;
    Ok(())
}

/// A dispatched call whose worker disappeared is conservatively charged once
/// after its bounded recovery lease. This releases the active reservation
/// without allowing a late provider response to create a second usage event.
fn recover_expired_dispatched_quota(
    tx: &mut Transaction<'_>,
    project: &str,
    month: &str,
) -> Result<()> {
    let rows = tx
        .query(
            "SELECT id
               FROM action_usage_reservations
              WHERE project_id=$1 AND month=$2 AND state='dispatched' AND expires_at<=now()
              FOR UPDATE",
            &[&project, &month],
        )
        .map_err(|_| unavailable())?;
    for row in rows {
        let id: String = row.get(0);
        let _ = tx
            .query_opt(
                "WITH reservation AS (
                     SELECT id,project_id,connector,action,external_account_id,created_at
                       FROM action_usage_reservations
                      WHERE id=$1 AND state='dispatched'
                 ), inserted AS (
                     INSERT INTO usage_events(
                         id,project_id,connection_id,connector,action,kind,occurred_at,
                         external_account_id,quantity,metering_event_key
                     )
                     SELECT 'usage_quota_recovery_' || id,project_id,NULL,connector,action,
                            'action_call',created_at,external_account_id,1,
                            'quota_recovery:' || id
                       FROM reservation
                     ON CONFLICT(project_id,metering_event_key) DO NOTHING
                     RETURNING project_id,external_account_id
                 )
                 INSERT INTO usage_monthly_rollups(
                     project_id,external_account_id,month,kind,quantity
                 )
                 SELECT project_id,COALESCE(external_account_id,''),$2,'action_call',1
                   FROM inserted
                 ON CONFLICT(project_id,external_account_id,month,kind)
                 DO UPDATE SET quantity=usage_monthly_rollups.quantity+EXCLUDED.quantity,
                               updated_at=now()
                 RETURNING project_id",
                &[&id, &month],
            )
            .map_err(|_| unavailable())?;
        tx.execute(
            "UPDATE action_usage_reservations
                SET state='settled', settled_at=now()
              WHERE id=$1 AND state='dispatched'",
            &[&id],
        )
        .map_err(|_| unavailable())?;
    }
    Ok(())
}

fn usage(
    tx: &mut Transaction<'_>,
    project: &str,
    month: &str,
    e: &Entitlements,
) -> Result<UsageSnapshot> {
    let row = tx
        .query_one(
            "SELECT COALESCE(sum(quantity),0)::bigint
               FROM usage_monthly_rollups
              WHERE project_id=$1 AND month=$2 AND kind='action_call'",
            &[&project, &month],
        )
        .map_err(|_| unavailable())?;
    let used: i64 = row.get(0);
    let active = tx
        .query_one(
            "SELECT count(*)::bigint
               FROM action_usage_reservations
              WHERE project_id=$1 AND month=$2 AND state IN ('pending','dispatched')",
            &[&project, &month],
        )
        .map_err(|_| unavailable())?
        .get::<_, i64>(0);
    let snapshot = UsageSnapshot {
        month: month.to_owned(),
        current: used,
        projected: used.saturating_add(active).saturating_add(1),
        soft_limit: e.action_calls_soft,
        hard_limit: e.action_calls_hard,
    };
    if e.action_calls_hard > 0 && snapshot.projected > e.action_calls_hard {
        let mut error = ActionError::new("USAGE_LIMIT_EXCEEDED");
        error.usage = Some(snapshot);
        return Err(error);
    }
    Ok(snapshot)
}
impl PolicyGate for PgPolicy {
    async fn authorize(&self, r: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        let project = r.project_id.clone();
        let config = self.config.clone();
        self.repository
            .run(move |c| {
                let mut tx = c.transaction().map_err(|_| unavailable())?;
                let _ = entitlements(&mut tx, &project, &config)?;
                tx.commit().map_err(|_| unavailable())
            })
            .await
    }
    async fn prepare_input(
        &self,
        r: &ExecuteRequest,
        c: &Connection,
        input: Value,
    ) -> Result<Value> {
        if c.connector == "apollo" {
            return apollo_input(&self.config, &r.action, &r.project_id, &c.id, input);
        }
        if c.connector != "unipile" {
            return Ok(input);
        }
        let mut fields = input
            .as_object()
            .cloned()
            .ok_or_else(|| ActionError::new("INVALID_ACTION_INPUT"))?;
        fields.remove("account_id");
        let channel = channel(&r.action).to_owned();
        if channel.is_empty() {
            return Ok(Value::Object(fields));
        }
        if r.external_account_id.is_empty() {
            return Err(ActionError::new("MISSING_SUBACCOUNT"));
        }
        let (project, brand) = (r.project_id.clone(), r.external_account_id.clone());
        self.repository.run(move|c|{
            let row=c.query_opt("SELECT provider_account_id,status FROM provider_subaccounts WHERE project_id=$1 AND external_account_id=$2 AND connector='unipile' AND channel=$3",&[&project,&brand,&channel]).map_err(|_|unavailable())?.ok_or_else(||ActionError::new("MISSING_SUBACCOUNT"))?;
            let status:&str=row.get(1);if status!="connected" {return Err(ActionError::new("CONNECTION_RESTRICTED"))}
            let account:String=row.get(0);if account.is_empty(){return Err(ActionError::new("MISSING_SUBACCOUNT"))}
            fields.insert("account_id".into(),Value::String(account));Ok(Value::Object(fields))
        }).await
    }
    async fn reserve(
        &self,
        r: &ExecuteRequest,
        c: &Connection,
        o: &Operation,
        input: &Value,
    ) -> Result<PolicyReservation> {
        let (project, connection_id, brand, action, connector) = (
            r.project_id.clone(),
            r.connection_id.clone(),
            r.external_account_id.clone(),
            r.action.clone(),
            c.connector.clone(),
        );
        let noted = r
            .input
            .get("message")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty());
        let expected_account = input
            .get("account_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let read = o.read_only;
        let config = self.config.clone();
        let reservation_lease_ms = (o.timeout_ms as i64).saturating_add(60_000).max(1);
        self.repository.run(move|c|{
            let mut tx=c.transaction().map_err(|_|unavailable())?;
            let e=entitlements(&mut tx,&project,&config)?;
            let month = utc_month(&mut tx)?;
            usage_quota_lock(&mut tx, &project, &month)?;
            expire_pending_quota(&mut tx, &project, &month)?;
            recover_expired_dispatched_quota(&mut tx, &project, &month)?;
            let quota_id = uuid::Uuid::new_v4().simple().to_string();
            let mut reservation=PolicyReservation {usage:usage(&mut tx,&project,&month,&e)?, quota_id: quota_id.clone(), quota_month: month.clone(), ..Default::default()};
            tx.execute("INSERT INTO action_usage_reservations(id,project_id,month,connection_id,connector,action,external_account_id,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',now()+($8::bigint * interval '1 millisecond'))",&[&quota_id,&project,&month,&connection_id,&connector,&action,&brand,&reservation_lease_ms]).map_err(|_|unavailable())?;
            if connector=="unipile" {
                reservation.channel=channel(&action).into();
                reservation.class=linkedin_class(&action).into();
                if !reservation.channel.is_empty() {
                    let row=tx.query_opt("SELECT status,EXTRACT(EPOCH FROM (now()-created_at))::bigint/86400,provider_account_id FROM provider_subaccounts WHERE project_id=$1 AND external_account_id=$2 AND connector='unipile' AND channel=$3 FOR SHARE",&[&project,&brand,&reservation.channel]).map_err(|_|unavailable())?.ok_or_else(||ActionError::new("MISSING_SUBACCOUNT"))?;
                    if row.get::<_,&str>(0)!="connected" {return Err(ActionError::new("CONNECTION_RESTRICTED"))}
                    reservation.provider_account_id=row.get(2);
                    if reservation.provider_account_id!=expected_account {return Err(ActionError::new("MISSING_SUBACCOUNT"))}
                    if !reservation.class.is_empty() {
                        let age:i64=row.get(1);let ceiling=config.linkedin.ceiling(&reservation.class,age);
                        reservation.windows=claim_linkedin(&mut tx,&project,&brand,&reservation.class,&ceiling,noted,if config.linkedin.warmup_enabled {age} else {56})?;
                    }
                }
            }
            if !read {claim_send(&mut tx,&project,&brand,&e,config.send_cost_micros)?;}
            tx.commit().map_err(|_|unavailable())?;Ok(reservation)
        }).await
    }
    async fn observe_failure(
        &self,
        r: &ExecuteRequest,
        c: &Connection,
        reservation: &PolicyReservation,
        code: &str,
    ) -> Result<()> {
        let restricted = code == "CONNECTOR_ACCOUNT_RESTRICTED";
        let refund = matches!(code, "INVALID_ACTION_INPUT" | "NOTE_TOO_LONG");
        if (!restricted || c.connector != "unipile" || reservation.channel.is_empty())
            && (!refund || reservation.windows.is_empty())
        {
            return Ok(());
        }
        let expected_account = reservation.provider_account_id.clone();
        let (project, brand, channel, class, windows) = (
            r.project_id.clone(),
            r.external_account_id.clone(),
            reservation.channel.clone(),
            reservation.class.clone(),
            reservation.windows.clone(),
        );
        self.repository.run(move|c|{
            let mut tx=c.transaction().map_err(|_|unavailable())?;
            if restricted {tx.execute("UPDATE provider_subaccounts SET status='needs_reconnect',updated_at=now() WHERE project_id=$1 AND external_account_id=$2 AND connector='unipile' AND channel=$3 AND provider_account_id=$4",&[&project,&brand,&channel,&expected_account]).map_err(|_|unavailable())?;}
            if refund {
                linkedin_lock(&mut tx,&project,&brand,&class)?;
                for (kind,key) in windows {tx.execute("UPDATE linkedin_action_counters SET count=GREATEST(count-1,0),updated_at=now() WHERE project_id=$1 AND external_account_id=$2 AND action_class=$3 AND window_kind=$4 AND window_key=$5",&[&project,&brand,&class,&kind,&key]).map_err(|_|unavailable())?;}
            }
            tx.commit().map_err(|_|unavailable())
        }).await
    }
}
fn claim_send(
    tx: &mut Transaction<'_>,
    project: &str,
    brand: &str,
    e: &Entitlements,
    cost: i64,
) -> Result<()> {
    let window = Utc::now().format("%Y-%m-%d").to_string();
    let row=tx.query_opt("INSERT INTO action_send_caps(project_id,external_account_id,window_key,send_count,spend_micros,updated_at) SELECT $1,$2,$3,1,$4,now() WHERE ($5::bigint=0 OR 1<=$5) AND ($6::bigint=0 OR $4::bigint<=$6) ON CONFLICT(project_id,external_account_id,window_key) DO UPDATE SET send_count=action_send_caps.send_count+1,spend_micros=action_send_caps.spend_micros+EXCLUDED.spend_micros,updated_at=now() WHERE ($5::bigint=0 OR action_send_caps.send_count+1<=$5) AND ($6::bigint=0 OR action_send_caps.spend_micros+EXCLUDED.spend_micros<=$6) RETURNING send_count",&[&project,&brand,&window,&cost,&e.send_cap,&e.spend_cap_micros]).map_err(|_|unavailable())?;
    if row.is_some() {
        return Ok(());
    }
    let current=tx.query_opt("SELECT send_count FROM action_send_caps WHERE project_id=$1 AND external_account_id=$2 AND window_key=$3",&[&project,&brand,&window]).map_err(|_|unavailable())?;
    let send = current.map(|r| r.get::<_, i64>(0)).unwrap_or(0);
    Err(ActionError::new(if e.send_cap > 0 && send >= e.send_cap {
        "SEND_CAP_EXCEEDED"
    } else {
        "SPEND_CAP_EXCEEDED"
    }))
}
fn linkedin_lock(tx: &mut Transaction<'_>, project: &str, brand: &str, class: &str) -> Result<()> {
    // Match the existing Go FNV-1a advisory lock, including trailing NULs.
    let mut hash = 0xcbf29ce484222325_u64;
    for part in [project, brand, class] {
        for b in part.bytes().chain(std::iter::once(0)) {
            hash ^= b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    tx.query_one("SELECT pg_advisory_xact_lock($1)", &[&(hash as i64)])
        .map_err(|_| unavailable())?;
    Ok(())
}
fn claim_linkedin(
    tx: &mut Transaction<'_>,
    project: &str,
    brand: &str,
    class: &str,
    ceiling: &Ceiling,
    noted: bool,
    age: i64,
) -> Result<Vec<(String, String)>> {
    linkedin_lock(tx, project, brand, class)?;
    let last=tx.query_opt("SELECT EXTRACT(EPOCH FROM (now()-last_sent_at))::bigint FROM linkedin_action_counters WHERE project_id=$1 AND external_account_id=$2 AND action_class=$3 AND window_kind='spacing' AND window_key='-'",&[&project,&brand,&class]).map_err(|_|unavailable())?;
    if ceiling.spacing_seconds > 0
        && last
            .and_then(|r| r.get::<_, Option<i64>>(0))
            .is_some_and(|seconds| seconds < ceiling.spacing_seconds)
    {
        return Err(ActionError::new("LINKEDIN_ACTION_TOO_FAST"));
    }
    let now = Utc::now();
    let iso = now.iso_week();
    let windows = [
        ("hour", now.format("%Y-%m-%dT%H").to_string(), ceiling.hour),
        ("day", now.format("%Y-%m-%d").to_string(), ceiling.day),
        (
            "week",
            format!("{:04}-W{:02}", iso.year(), iso.week()),
            ceiling.week,
        ),
        (
            "month",
            now.format("%Y-%m").to_string(),
            if noted { ceiling.month } else { 0 },
        ),
    ];
    let mut charged = Vec::new();
    for (kind, key, cap) in windows {
        if cap <= 0 {
            continue;
        }
        let row=tx.query_opt("INSERT INTO linkedin_action_counters(project_id,external_account_id,action_class,window_kind,window_key,count,updated_at) VALUES($1,$2,$3,$4,$5,1,now()) ON CONFLICT(project_id,external_account_id,action_class,window_kind,window_key) DO UPDATE SET count=linkedin_action_counters.count+1,updated_at=now() WHERE linkedin_action_counters.count+1<=$6 RETURNING count",&[&project,&brand,&class,&kind,&key,&cap]).map_err(|_|unavailable())?;
        if row.is_none() {
            return Err(ActionError::new(if kind == "month" {
                "LINKEDIN_NOTED_INVITE_CAP_EXCEEDED"
            } else if age < 56 {
                "LINKEDIN_WARMUP_LIMITED"
            } else if class == "invitation" {
                "LINKEDIN_INVITE_CAP_EXCEEDED"
            } else if class == "message" {
                "LINKEDIN_MESSAGE_CAP_EXCEEDED"
            } else {
                "LINKEDIN_VIEW_CAP_EXCEEDED"
            }));
        }
        charged.push((kind.into(), key));
    }
    tx.execute("INSERT INTO linkedin_action_counters(project_id,external_account_id,action_class,window_kind,window_key,count,last_sent_at,updated_at) VALUES($1,$2,$3,'spacing','-',0,now(),now()) ON CONFLICT(project_id,external_account_id,action_class,window_kind,window_key) DO UPDATE SET last_sent_at=now(),updated_at=now()",&[&project,&brand,&class]).map_err(|_|unavailable())?;
    Ok(charged)
}
