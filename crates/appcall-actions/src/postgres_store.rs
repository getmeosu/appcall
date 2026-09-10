use crate::*;
use postgres::{Client, Transaction};
use std::sync::{Arc, Mutex};

/// Host-owned PostgreSQL connection; blocking SQL stays off async executor threads.
/// Uses the existing Go schema. No migration is run by this adapter.
#[derive(Clone)]
pub struct PgActionRepository {
    client: Arc<Mutex<Client>>,
}
impl PgActionRepository {
    pub fn database_health(&self) -> Option<bool> {
        match self.client.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn from_store(store: appcall_store::Store) -> Self {
        Self::new(store.into_client())
    }
    pub fn new(client: Client) -> Self {
        Self {
            client: Arc::new(Mutex::new(client)),
        }
    }
    pub fn with_shared_client(client: Arc<Mutex<Client>>) -> Self {
        Self { client }
    }
    pub(crate) async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut Client) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let client = self.client.clone();
        tokio::task::spawn_blocking(move || {
            let mut c = client.lock().map_err(|_| storage())?;
            operation(&mut c)
        })
        .await
        .map_err(|_| storage())?
    }

    async fn release_quota_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
        allow_dispatched: bool,
        clear_claim: bool,
    ) -> Result<()> {
        if reservation.quota_id.is_empty() {
            return self.release_pending(attempt).await;
        }
        let a = attempt.clone();
        let quota_id = reservation.quota_id.clone();
        let quota_month = reservation.quota_month.clone();
        self.run(move |client| {
            let mut tx = client.transaction().map_err(|_| storage())?;
            crate::policy_postgres::usage_quota_lock(&mut tx, &a.project_id, &quota_month)?;
            let state = tx
                .query_opt(
                    "SELECT state
                       FROM action_usage_reservations
                      WHERE id=$1 AND project_id=$2 AND month=$3
                      FOR UPDATE",
                    &[&quota_id, &a.project_id, &quota_month],
                )
                .map_err(|_| storage())?
                .map(|row| row.get::<_, String>(0));
            let can_clear_claim = state.as_deref() == Some("pending")
                || (allow_dispatched && state.as_deref() == Some("dispatched"));
            if can_clear_claim {
                tx.execute(
                    "UPDATE action_usage_reservations
                        SET state='released', released_at=now()
                      WHERE id=$1 AND state IN ('pending','dispatched')",
                    &[&quota_id],
                )
                .map_err(|_| storage())?;
            }
            if !a.key.is_empty() {
                let query = if clear_claim && can_clear_claim {
                    "DELETE FROM action_idempotency_claims
                      WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3"
                } else {
                    "DELETE FROM action_idempotency_claims
                      WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3
                        AND dispatched_at IS NULL"
                };
                tx.execute(query, &[&a.project_id, &a.key, &a.request_id])
                    .map_err(|_| storage())?;
            }
            tx.commit().map_err(|_| storage())
        })
        .await
    }
}
fn storage() -> ActionError {
    ActionError::new("STORAGE_UNAVAILABLE")
}
impl ActionRepository for PgActionRepository {
    fn database_health(&self) -> Option<bool> {
        PgActionRepository::database_health(self)
    }
    async fn connection(&self, project: &str, id: &str) -> Result<Connection> {
        let (project, id) = (project.to_owned(), id.to_owned());
        self.run(move|c|{let row=c.query_opt("SELECT id,project_id,connector,status,auth_type,external_account_id,secret_ref_id FROM connections WHERE project_id=$1 AND id=$2",&[&project,&id]).map_err(|_|storage())?.ok_or_else(||ActionError::new("CONNECTION_NOT_FOUND"))?;Ok(Connection{id:row.get(0),project_id:row.get(1),connector:row.get(2),status:row.get(3),auth_type:row.get(4),external_account_id:row.get::<_,Option<String>>(5).unwrap_or_default(),secret_ref_id:row.get(6)})}).await
    }
    async fn acquire(&self, attempt: &Attempt) -> Result<Acquisition> {
        let a = attempt.clone();
        self.run(move|c|{
  let mut tx=c.transaction().map_err(|_|storage())?;
  lock_key(&mut tx,&a)?;
  let disabled=tx.query_opt("SELECT disabled_at IS NOT NULL FROM projects WHERE id=$1",&[&a.project_id]).map_err(|_|storage())?.map(|r|r.get::<_,bool>(0)).unwrap_or(true);if disabled{return Err(ActionError::new("PROJECT_DISABLED"))}
  if a.key.is_empty(){tx.commit().map_err(|_|storage())?;return Ok(Acquisition::Acquired)}
  if let Some(row)=tx.query_opt("SELECT connection_id,action,input_hash,output FROM action_idempotency_records WHERE project_id=$1 AND idempotency_key=$2",&[&a.project_id,&a.key]).map_err(|_|storage())?{if row.get::<_,String>(0)!=a.connection_id||row.get::<_,String>(1)!=a.action||row.get::<_,String>(2)!=a.input_hash{return Err(ActionError::new("IDEMPOTENCY_CONFLICT"))};let output=row.get(3);tx.commit().map_err(|_|storage())?;return Ok(Acquisition::Cached(output))}
  let row=tx.query_opt("INSERT INTO action_idempotency_claims(project_id,idempotency_key,connection_id,action,input_hash,request_id,leased_until) VALUES($1,$2,$3,$4,$5,$6,now()+($7::bigint*interval '1 millisecond')) ON CONFLICT(project_id,idempotency_key) DO UPDATE SET request_id=EXCLUDED.request_id,leased_until=EXCLUDED.leased_until WHERE action_idempotency_claims.connection_id=EXCLUDED.connection_id AND action_idempotency_claims.action=EXCLUDED.action AND action_idempotency_claims.input_hash=EXCLUDED.input_hash AND action_idempotency_claims.leased_until<=now() AND action_idempotency_claims.dispatched_at IS NULL RETURNING request_id",&[&a.project_id,&a.key,&a.connection_id,&a.action,&a.input_hash,&a.request_id,&a.lease_ms]).map_err(|_|storage())?;
  if row.is_none(){let row=tx.query_one("SELECT connection_id,action,input_hash FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2",&[&a.project_id,&a.key]).map_err(|_|storage())?;let matching=row.get::<_,String>(0)==a.connection_id&&row.get::<_,String>(1)==a.action&&row.get::<_,String>(2)==a.input_hash;return Err(ActionError::new(if matching{"IDEMPOTENCY_IN_PROGRESS"}else{"IDEMPOTENCY_CONFLICT"}))}
  // A legacy Go finisher does not take our advisory lock. Recheck after the
  // unique claim INSERT has waited for its deletion to avoid redispatching it.
  if let Some(row)=tx.query_opt("SELECT connection_id,action,input_hash,output FROM action_idempotency_records WHERE project_id=$1 AND idempotency_key=$2",&[&a.project_id,&a.key]).map_err(|_|storage())? {
   if row.get::<_,String>(0)!=a.connection_id||row.get::<_,String>(1)!=a.action||row.get::<_,String>(2)!=a.input_hash{return Err(ActionError::new("IDEMPOTENCY_CONFLICT"))};
   let output=row.get(3);
   tx.execute("DELETE FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3",&[&a.project_id,&a.key,&a.request_id]).map_err(|_|storage())?;
   tx.commit().map_err(|_|storage())?;return Ok(Acquisition::Cached(output));
  }
  tx.commit().map_err(|_|storage())?;Ok(Acquisition::Acquired)
 }).await
    }
    async fn mark_dispatched(&self, attempt: &Attempt) -> Result<()> {
        let a = attempt.clone();
        self.run(move|c|{if a.key.is_empty(){return Ok(())};let count=c.execute("UPDATE action_idempotency_claims SET dispatched_at=now() WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3 AND leased_until>now() AND dispatched_at IS NULL",&[&a.project_id,&a.key,&a.request_id]).map_err(|_|storage())?;if count!=1{return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"))};Ok(())}).await
    }
    async fn mark_dispatched_checked(
        &self,
        attempt: &Attempt,
        revision: &Connection,
    ) -> Result<()> {
        let a = attempt.clone();
        let revision = revision.clone();
        self.run(move |client| {
            let mut tx = client.transaction().map_err(|_|storage())?;
            let row = tx.query_opt("SELECT id,project_id,connector,status,auth_type,external_account_id,secret_ref_id FROM connections WHERE project_id=$1 AND id=$2 FOR UPDATE", &[&a.project_id,&a.connection_id]).map_err(|_|storage())?.ok_or_else(||ActionError::new("CONNECTION_NOT_FOUND"))?;
            let current = Connection {id:row.get(0),project_id:row.get(1),connector:row.get(2),status:row.get(3),auth_type:row.get(4),external_account_id:row.get::<_,Option<String>>(5).unwrap_or_default(),secret_ref_id:row.get(6)};
            if current != revision || current.status != "active" {
                return Err(ActionError::new("CONNECTION_CHANGED"));
            }
            if !a.key.is_empty() {
                let count=tx.execute("UPDATE action_idempotency_claims SET dispatched_at=now() WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3 AND leased_until>now() AND dispatched_at IS NULL",&[&a.project_id,&a.key,&a.request_id]).map_err(|_|storage())?;
                if count!=1 {return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));}
            }
            tx.commit().map_err(|_|storage())
        }).await
    }
    async fn mark_dispatched_checked_with_reservation(
        &self,
        attempt: &Attempt,
        revision: &Connection,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        if reservation.quota_id.is_empty() {
            return self.mark_dispatched_checked(attempt, revision).await;
        }
        let a = attempt.clone();
        let revision = revision.clone();
        let quota_id = reservation.quota_id.clone();
        let quota_month = reservation.quota_month.clone();
        self.run(move |client| {
            let mut tx = client.transaction().map_err(|_| storage())?;
            crate::policy_postgres::usage_quota_lock(&mut tx, &a.project_id, &quota_month)?;
            let quota = tx
                .query_opt(
                    "SELECT state,expires_at>now()
                       FROM action_usage_reservations
                      WHERE id=$1 AND project_id=$2 AND month=$3
                      FOR UPDATE",
                    &[&quota_id, &a.project_id, &quota_month],
                )
                .map_err(|_| storage())?
                .ok_or_else(|| ActionError::new("USAGE_RESERVATION_INVALID"))?;
            let state: &str = quota.get(0);
            let unexpired: bool = quota.get(1);
            if state == "dispatched" {
                if !a.key.is_empty() {
                    let owned = tx
                        .query_opt(
                            "SELECT request_id
                               FROM action_idempotency_claims
                              WHERE project_id=$1 AND idempotency_key=$2",
                            &[&a.project_id, &a.key],
                        )
                        .map_err(|_| storage())?
                        .is_some_and(|row| row.get::<_, String>(0) == a.request_id);
                    if !owned {
                        return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
                    }
                }
                tx.commit().map_err(|_| storage())?;
                return Ok(());
            }
            if state != "pending" || !unexpired {
                return Err(ActionError::new("USAGE_RESERVATION_INVALID"));
            }
            let row = tx
                .query_opt(
                    "SELECT id,project_id,connector,status,auth_type,external_account_id,secret_ref_id
                       FROM connections
                      WHERE project_id=$1 AND id=$2
                      FOR UPDATE",
                    &[&a.project_id, &a.connection_id],
                )
                .map_err(|_| storage())?
                .ok_or_else(|| ActionError::new("CONNECTION_NOT_FOUND"))?;
            let current = Connection {
                id: row.get(0),
                project_id: row.get(1),
                connector: row.get(2),
                status: row.get(3),
                auth_type: row.get(4),
                external_account_id: row.get::<_, Option<String>>(5).unwrap_or_default(),
                secret_ref_id: row.get(6),
            };
            if current != revision || current.status != "active" {
                return Err(ActionError::new("CONNECTION_CHANGED"));
            }
            if !a.key.is_empty() {
                let count = tx
                    .execute(
                        "UPDATE action_idempotency_claims
                            SET dispatched_at=now()
                          WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3
                            AND leased_until>now() AND dispatched_at IS NULL",
                        &[&a.project_id, &a.key, &a.request_id],
                    )
                    .map_err(|_| storage())?;
                if count != 1 {
                    return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
                }
            }
            tx.execute(
                "UPDATE action_usage_reservations
                    SET state='dispatched', dispatched_at=now(),
                        expires_at=now()+interval '24 hours'
                  WHERE id=$1 AND state='pending'",
                &[&quota_id],
            )
            .map_err(|_| storage())?;
            tx.commit().map_err(|_| storage())
        })
        .await
    }
    async fn record_replay(&self, attempt: &Attempt, sanitized_input: &Value) -> Result<String> {
        let a = attempt.clone();
        let input = sanitized_input.clone();
        self.run(move |c| {
            let id=format!("replay_{}",a.request_id);
            let row=c.query_opt("INSERT INTO action_replay_logs(id,project_id,connection_id,connector,action,request_id,sanitized_input,external_account_id) SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM connections WHERE id=$3 AND project_id=$2 AND ($8='' OR COALESCE(external_account_id,'')='' OR external_account_id=$8) RETURNING id",&[&id,&a.project_id,&a.connection_id,&a.connector,&a.action,&a.request_id,&input,&a.external_account_id]).map_err(|_|storage())?.ok_or_else(||ActionError::new("CONNECTION_NOT_FOUND"))?;
            Ok(row.get(0))
        }).await
    }
    async fn release_pending(&self, attempt: &Attempt) -> Result<()> {
        let a = attempt.clone();
        self.run(move|c|{if !a.key.is_empty(){c.execute("DELETE FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3 AND dispatched_at IS NULL",&[&a.project_id,&a.key,&a.request_id]).map_err(|_|storage())?;}Ok(())}).await
    }
    async fn release_pending_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        self.release_quota_reservation(attempt, reservation, false, true)
            .await
    }
    async fn release_quota_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        self.release_quota_reservation(attempt, reservation, true, false)
            .await
    }
    async fn release_not_dispatched_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        if reservation.quota_id.is_empty() {
            let a = attempt.clone();
            return self
                .run(move |client| {
                    if !a.key.is_empty() {
                        client
                            .execute(
                                "DELETE FROM action_idempotency_claims
                                  WHERE project_id=$1 AND idempotency_key=$2
                                    AND request_id=$3 AND dispatched_at IS NOT NULL",
                                &[&a.project_id, &a.key, &a.request_id],
                            )
                            .map_err(|_| storage())?;
                    }
                    Ok(())
                })
                .await;
        }
        self.release_quota_reservation(attempt, reservation, true, true)
            .await
    }
    async fn finish_not_dispatched_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
        error_code: &str,
    ) -> Result<()> {
        let a = attempt.clone();
        let error = error_code.to_owned();
        if reservation.quota_id.is_empty() {
            return self
                .run(move |client| {
                    let mut tx = client.transaction().map_err(|_| storage())?;
                    lock_key(&mut tx, &a)?;
                    if !a.key.is_empty()
                        && tx
                            .query_opt(
                                "SELECT request_id
                                   FROM action_idempotency_claims
                                  WHERE project_id=$1 AND idempotency_key=$2
                                    AND request_id=$3 AND dispatched_at IS NOT NULL
                                  FOR UPDATE",
                                &[&a.project_id, &a.key, &a.request_id],
                            )
                            .map_err(|_| storage())?
                            .is_none()
                    {
                        return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
                    }
                    write_log(&mut tx, &a, Some(&error))?;
                    if !a.key.is_empty() {
                        tx.execute(
                            "DELETE FROM action_idempotency_claims
                              WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3",
                            &[&a.project_id, &a.key, &a.request_id],
                        )
                        .map_err(|_| storage())?;
                    }
                    tx.commit().map_err(|_| storage())
                })
                .await;
        }

        let quota_id = reservation.quota_id.clone();
        let quota_month = reservation.quota_month.clone();
        self.run(move |client| {
            let mut tx = client.transaction().map_err(|_| storage())?;
            crate::policy_postgres::usage_quota_lock(&mut tx, &a.project_id, &quota_month)?;
            lock_key(&mut tx, &a)?;
            let state = tx
                .query_opt(
                    "SELECT state
                       FROM action_usage_reservations
                      WHERE id=$1 AND project_id=$2 AND month=$3
                      FOR UPDATE",
                    &[&quota_id, &a.project_id, &quota_month],
                )
                .map_err(|_| storage())?
                .ok_or_else(|| ActionError::new("USAGE_RESERVATION_INVALID"))?
                .get::<_, String>(0);
            if state != "dispatched" {
                return Err(ActionError::new("USAGE_RESERVATION_INVALID"));
            }
            if !a.key.is_empty()
                && tx
                    .query_opt(
                        "SELECT request_id
                           FROM action_idempotency_claims
                          WHERE project_id=$1 AND idempotency_key=$2
                            AND request_id=$3 AND dispatched_at IS NOT NULL
                          FOR UPDATE",
                        &[&a.project_id, &a.key, &a.request_id],
                    )
                    .map_err(|_| storage())?
                    .is_none()
            {
                return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
            }
            write_log(&mut tx, &a, Some(&error))?;
            tx.execute(
                "UPDATE action_usage_reservations
                    SET state='released', released_at=now()
                  WHERE id=$1 AND state='dispatched'",
                &[&quota_id],
            )
            .map_err(|_| storage())?;
            if !a.key.is_empty() {
                tx.execute(
                    "DELETE FROM action_idempotency_claims
                      WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3",
                    &[&a.project_id, &a.key, &a.request_id],
                )
                .map_err(|_| storage())?;
            }
            tx.commit().map_err(|_| storage())
        })
        .await
    }
    async fn finish(
        &self,
        attempt: &Attempt,
        output: Option<&Value>,
        error_code: Option<&str>,
    ) -> Result<()> {
        let a = attempt.clone();
        let output = output.cloned();
        let error = error_code.map(str::to_owned);
        self.run(move|c|{let mut tx=c.transaction().map_err(|_|storage())?;
  lock_key(&mut tx,&a)?;
  if !a.key.is_empty(){let row=tx.query_opt("SELECT request_id FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3 AND dispatched_at IS NOT NULL FOR UPDATE",&[&a.project_id,&a.key,&a.request_id]).map_err(|_|storage())?;if row.is_none(){return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"))}}
  write_log(&mut tx,&a,error.as_deref())?;
  if let Some(output)=output{
   if !a.key.is_empty(){tx.execute("INSERT INTO action_idempotency_records(project_id,idempotency_key,connection_id,action,input_hash,output) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,idempotency_key) DO NOTHING",&[&a.project_id,&a.key,&a.connection_id,&a.action,&a.input_hash,&output]).map_err(|_|storage())?;}
   write_usage(&mut tx,&a,None,None)?;
   if !a.key.is_empty(){tx.execute("DELETE FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3",&[&a.project_id,&a.key,&a.request_id]).map_err(|_|storage())?;}
  }
  tx.commit().map_err(|_|storage())?;Ok(())
 }).await
    }
    async fn finish_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
        output: Option<&Value>,
        error_code: Option<&str>,
    ) -> Result<()> {
        if reservation.quota_id.is_empty() {
            return self.finish(attempt, output, error_code).await;
        }
        let a = attempt.clone();
        let output = output.cloned();
        let error = error_code.map(str::to_owned);
        let quota_id = reservation.quota_id.clone();
        let quota_month = reservation.quota_month.clone();
        self.run(move |client| {
            let mut tx = client.transaction().map_err(|_| storage())?;
            crate::policy_postgres::usage_quota_lock(&mut tx, &a.project_id, &quota_month)?;
            lock_key(&mut tx, &a)?;
            let state = tx
                .query_opt(
                    "SELECT state
                       FROM action_usage_reservations
                      WHERE id=$1 AND project_id=$2 AND month=$3
                      FOR UPDATE",
                    &[&quota_id, &a.project_id, &quota_month],
                )
                .map_err(|_| storage())?
                .ok_or_else(|| ActionError::new("USAGE_RESERVATION_INVALID"))?
                .get::<_, String>(0);
            if output.is_some() && state == "released" {
                return Err(ActionError::new("USAGE_RESERVATION_INVALID"));
            }

            let claim_exists = if !a.key.is_empty() {
                tx.query_opt(
                    "SELECT request_id
                       FROM action_idempotency_claims
                      WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3
                        AND dispatched_at IS NOT NULL
                      FOR UPDATE",
                    &[&a.project_id, &a.key, &a.request_id],
                )
                .map_err(|_| storage())?
                .is_some()
            } else {
                false
            };
            if !claim_exists && !a.key.is_empty() {
                if state == "settled" {
                    let existing = tx
                        .query_opt(
                            "SELECT connection_id,action,input_hash
                               FROM action_idempotency_records
                              WHERE project_id=$1 AND idempotency_key=$2",
                            &[&a.project_id, &a.key],
                        )
                        .map_err(|_| storage())?;
                    if existing.is_some_and(|row| {
                        row.get::<_, String>(0) == a.connection_id
                            && row.get::<_, String>(1) == a.action
                            && row.get::<_, String>(2) == a.input_hash
                    }) {
                        tx.commit().map_err(|_| storage())?;
                        return Ok(());
                    }
                }
                if !(state == "released" && error.is_some()) {
                    return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
                }
            }
            write_log(&mut tx, &a, error.as_deref())?;
            if let Some(output) = output {
                if !a.key.is_empty() {
                    tx.execute(
                        "INSERT INTO action_idempotency_records(project_id,idempotency_key,connection_id,action,input_hash,output)
                         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,idempotency_key) DO NOTHING",
                        &[&a.project_id, &a.key, &a.connection_id, &a.action, &a.input_hash, &output],
                    )
                    .map_err(|_| storage())?;
                }
                if state == "dispatched" {
                    write_usage(&mut tx, &a, Some(&quota_month), Some(&quota_id))?;
                    tx.execute(
                        "UPDATE action_usage_reservations
                            SET state='settled', settled_at=now()
                          WHERE id=$1 AND state='dispatched'",
                        &[&quota_id],
                    )
                    .map_err(|_| storage())?;
                } else if state != "settled" {
                    return Err(ActionError::new("USAGE_RESERVATION_INVALID"));
                }
                if !a.key.is_empty() {
                    tx.execute(
                        "DELETE FROM action_idempotency_claims
                          WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3",
                        &[&a.project_id, &a.key, &a.request_id],
                    )
                    .map_err(|_| storage())?;
                }
            }
            tx.commit().map_err(|_| storage())
        })
        .await
    }
}
fn write_log(tx: &mut Transaction<'_>, a: &Attempt, error: Option<&str>) -> Result<()> {
    let status = if error.is_some() {
        "failed"
    } else {
        "succeeded"
    };
    let id = format!("alog_{}", a.request_id);
    let code = error.unwrap_or("");
    tx.execute("INSERT INTO action_logs(id,request_id,project_id,connection_id,connector,action,status,error_code,external_account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",&[&id,&a.request_id,&a.project_id,&a.connection_id,&a.connector,&a.action,&status,&code,&a.external_account_id]).map_err(|_|storage())?;
    Ok(())
}
fn write_usage(
    tx: &mut Transaction<'_>,
    a: &Attempt,
    month: Option<&str>,
    reservation_id: Option<&str>,
) -> Result<()> {
    let id = format!("usage_action_{}", a.request_id);
    let month = month.map(str::to_owned);
    let reservation_id = reservation_id.map(str::to_owned);
    tx.execute("WITH inserted AS (INSERT INTO usage_events(id,project_id,connection_id,connector,action,kind,occurred_at,external_account_id,quantity,metering_event_key) VALUES($1,$2,$3,$4,$5,'action_call',COALESCE((SELECT created_at FROM action_usage_reservations WHERE id=$7),now()),$6,1,$1) ON CONFLICT(project_id,metering_event_key) DO NOTHING RETURNING project_id,external_account_id,occurred_at,kind,quantity) INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) SELECT project_id,COALESCE(external_account_id,''),COALESCE($8::text,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM')),kind,quantity FROM inserted ON CONFLICT(project_id,external_account_id,month,kind) DO UPDATE SET quantity=usage_monthly_rollups.quantity+EXCLUDED.quantity,updated_at=now()",&[&id,&a.project_id,&a.connection_id,&a.connector,&a.action,&a.external_account_id,&reservation_id,&month]).map_err(|_|storage())?;
    Ok(())
}

fn lock_key(tx: &mut Transaction<'_>, a: &Attempt) -> Result<()> {
    if !a.key.is_empty() {
        let identity = serde_json::to_string(&[&a.project_id, &a.key]).map_err(|_| storage())?;
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            &[&identity],
        )
        .map_err(|_| storage())?;
    }
    Ok(())
}
