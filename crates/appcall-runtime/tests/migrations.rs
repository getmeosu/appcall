use appcall_runtime::{find_migrations_dir, MigrationError, SqlxMigration};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
static FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn directory() -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "atlas_fixture_{}_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        FIXTURE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    std::fs::create_dir(&path).unwrap();
    path
}
#[test]
fn upward_migration_discovery_matches_go_and_falls_back() {
    let root = directory();
    let nested = root.join("a/b");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::create_dir(root.join("migrations")).unwrap();
    assert_eq!(find_migrations_dir(&nested), root.join("migrations"));
    std::fs::create_dir(root.join("a/migrations")).unwrap();
    assert_eq!(find_migrations_dir(&nested), root.join("a/migrations"));
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn configuration_and_cancel_errors_are_safe() {
    let root = directory();
    assert!(SqlxMigration::new("", "postgres://localhost/db", Duration::from_secs(1)).is_err());
    let migration = SqlxMigration::new(
        &root,
        "postgres://user:private-password@localhost/db",
        Duration::from_secs(1),
    )
    .unwrap();
    let error = migration.apply_cancellable(|| true).unwrap_err();
    assert_eq!(error, MigrationError::Cancelled);
    assert!(!format!("{error:?} {error}").contains("private-password"));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "requires explicit PostgreSQL URL"]
fn postgres_migrations_are_atomic_repeatable_and_cancel_physical_work() {
    let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut db = appcall_runtime::connect_database_url(&base, false).unwrap();
    let schema = format!("sqlx_test_{}", std::process::id());
    db.batch_execute(&format!("CREATE SCHEMA {schema}"))
        .unwrap();
    let url = format!("{base}&options=-csearch_path%3D{schema}");
    let dir = directory();
    std::fs::write(dir.join("1_initial.sql"), "CREATE TABLE proof(id int);").unwrap();
    let migration = SqlxMigration::new(&dir, &url, Duration::from_secs(5)).unwrap();
    assert_eq!(migration.apply(), Ok(()));
    assert_eq!(migration.apply(), Ok(()));
    std::fs::write(
        dir.join("2_slow.sql"),
        "INSERT INTO proof VALUES (1); SELECT pg_sleep(20); INSERT INTO proof VALUES(2);",
    )
    .unwrap();
    let start = Instant::now();
    assert_eq!(
        migration.apply_cancellable(|| start.elapsed() > Duration::from_millis(150)),
        Err(MigrationError::Cancelled)
    );
    assert!(start.elapsed() < Duration::from_secs(3));
    assert_eq!(
        db.query_one(&format!("SELECT count(*) FROM {schema}.proof"), &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.query_one(
            "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'appcall-migrations' AND query LIKE '%pg_sleep(20)%'",
            &[]
        )
        .unwrap()
        .get::<_, i64>(0),
        0
    );
    let short = SqlxMigration::new(&dir, &url, Duration::from_millis(150)).unwrap();
    assert_eq!(short.apply(), Err(MigrationError::Timeout));
    assert_eq!(
        db.query_one(&format!("SELECT count(*) FROM {schema}.proof"), &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    std::fs::write(dir.join("2_slow.sql"), "INSERT INTO proof VALUES (3);").unwrap();
    assert_eq!(migration.apply(), Ok(()));
    std::fs::write(dir.join("1_initial.sql"), "CREATE TABLE proof(id bigint);").unwrap();
    assert_eq!(migration.apply(), Err(MigrationError::Failed));
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn async_callers_receive_typed_error_instead_of_panicking() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let migration = SqlxMigration::new(
            "migrations",
            "postgres://localhost/db",
            Duration::from_secs(1),
        )
        .unwrap();
        assert_eq!(migration.apply(), Err(MigrationError::Configuration));
    });
}

#[test]
#[ignore = "requires explicit PostgreSQL URL"]
fn verified_legacy_history_is_adopted_without_replaying_sql() {
    use base64::Engine;
    use sha2::Digest;
    let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut db = appcall_runtime::connect_database_url(&base, false).unwrap();
    let schema = format!("legacy_test_{}", std::process::id());
    db.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path={schema}; CREATE TABLE proof(id int); INSERT INTO proof VALUES(42);")).unwrap();
    let url = format!("{base}&options=-csearch_path%3D{schema}");
    let dir = directory();
    let sql = "CREATE TABLE proof(id int);";
    std::fs::write(dir.join("1_initial.sql"), sql).unwrap();
    let migration = SqlxMigration::new(&dir, &url, Duration::from_secs(5)).unwrap();
    assert_eq!(migration.apply(), Err(MigrationError::Failed)); // Untracked schema.
    db.batch_execute("CREATE TABLE atlas_schema_revisions(version text, type int, applied int, total int, error text, error_stmt text, hash text)").unwrap();
    let mut hasher = sha2::Sha256::new();
    hasher.update(b"1_initial.sql");
    hasher.update(sql.as_bytes());
    let hash = base64::engine::general_purpose::STANDARD.encode(hasher.finalize());
    db.execute(
        "INSERT INTO atlas_schema_revisions VALUES('1',2,1,1,NULL,NULL,$1)",
        &[&hash],
    )
    .unwrap();
    assert_eq!(migration.apply(), Ok(()));
    assert_eq!(migration.apply(), Ok(()));
    assert_eq!(
        db.query_one("SELECT id FROM proof", &[])
            .unwrap()
            .get::<_, i32>(0),
        42
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM _sqlx_migrations", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    db.execute("UPDATE atlas_schema_revisions SET hash='invalid'", &[])
        .unwrap();
    assert_eq!(migration.apply(), Err(MigrationError::Failed));
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
#[ignore = "requires explicit PostgreSQL URL and create database rights"]
fn concurrent_migrations_rollback_failures_and_refuse_global_legacy_namespace() {
    let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = appcall_runtime::connect_database_url(&base, false).unwrap();
    let name = format!("sqlx_concurrency_{}", std::process::id());
    admin
        .batch_execute(&format!("CREATE DATABASE {name}"))
        .unwrap();
    let (without_query, query) = base.split_once('?').unwrap_or((&base, ""));
    let url = format!(
        "{}/{name}?{query}",
        without_query.rsplit_once('/').unwrap().0
    );
    let mut db = appcall_runtime::connect_database_url(&url, false).unwrap();
    let dir = directory();
    let sql = "CREATE TABLE proof(id int);";
    std::fs::write(dir.join("1_initial.sql"), sql).unwrap();
    db.batch_execute("CREATE SCHEMA atlas_schema_revisions; CREATE TABLE atlas_schema_revisions.atlas_schema_revisions(version text, type int, applied int, total int, error text, error_stmt text, hash text); CREATE SCHEMA unrelated; CREATE TABLE unrelated.proof(id int);").unwrap();
    use base64::Engine;
    use sha2::Digest;
    let mut hash = sha2::Sha256::new();
    hash.update(b"1_initial.sql");
    hash.update(sql.as_bytes());
    let hash = base64::engine::general_purpose::STANDARD.encode(hash.finalize());
    db.execute(
        "INSERT INTO atlas_schema_revisions.atlas_schema_revisions VALUES('1',2,1,1,NULL,NULL,$1)",
        &[&hash],
    )
    .unwrap();
    assert_eq!(
        SqlxMigration::new(&dir, &url, Duration::from_secs(5))
            .unwrap()
            .apply(),
        Err(MigrationError::Failed)
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM _sqlx_migrations", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    db.batch_execute("DROP SCHEMA atlas_schema_revisions CASCADE")
        .unwrap();
    std::fs::write(
        dir.join("1_initial.sql"),
        "CREATE TABLE proof(id int); SELECT pg_sleep(0.1);",
    )
    .unwrap();
    let results = std::thread::scope(|scope| {
        let first = scope.spawn(|| {
            SqlxMigration::new(&dir, &url, Duration::from_secs(5))
                .unwrap()
                .apply()
        });
        let second = scope.spawn(|| {
            SqlxMigration::new(&dir, &url, Duration::from_secs(5))
                .unwrap()
                .apply()
        });
        (first.join().unwrap(), second.join().unwrap())
    });
    assert_eq!(results, (Ok(()), Ok(())));
    assert_eq!(
        db.query_one("SELECT count(*) FROM _sqlx_migrations", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    std::fs::write(
        dir.join("2_failure.sql"),
        "INSERT INTO proof VALUES(1); SELECT 1/0;",
    )
    .unwrap();
    assert_eq!(
        SqlxMigration::new(&dir, &url, Duration::from_secs(5))
            .unwrap()
            .apply(),
        Err(MigrationError::Failed)
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM proof", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM _sqlx_migrations", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    drop(db);
    admin
        .batch_execute(&format!("DROP DATABASE {name}"))
        .unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn libpq_environment_cannot_redirect_migrations() {
    const CHILD: &str = "APPCALL_MIGRATION_ENV_TEST_CHILD";
    if std::env::var_os(CHILD).is_some() {
        assert!(matches!(
            SqlxMigration::new(
                "migrations",
                "postgres://localhost/postgres",
                Duration::from_secs(1)
            ),
            Err(MigrationError::Configuration)
        ));
        return;
    }
    let result = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "libpq_environment_cannot_redirect_migrations"])
        .env(CHILD, "1")
        .env("PGOPTIONS", "-csearch_path=wrong_schema")
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn unknown_url_parameter_secrets_are_rejected_before_sqlx_logging() {
    let result = SqlxMigration::new(
        "migrations",
        "postgres://localhost/postgres?secretkey=private-password",
        Duration::from_secs(1),
    );
    let error = match result {
        Err(error) => error,
        Ok(_) => panic!("unknown URL parameter accepted"),
    };
    assert_eq!(error, MigrationError::Configuration);
    assert!(!format!("{error:?} {error}").contains("private-password"));
}

#[test]
fn connection_settings_are_revalidated_when_migrations_start() {
    const CHILD: &str = "APPCALL_MIGRATION_APPLY_ENV_CHILD";
    if std::env::var_os(CHILD).is_some() {
        let migration = SqlxMigration::new(
            "migrations",
            "postgres://localhost:1/postgres?sslmode=disable",
            Duration::from_millis(100),
        )
        .unwrap();
        // This branch runs alone in a child process, never alongside other tests.
        std::env::set_var("PGOPTIONS", "-csearch_path=wrong_schema");
        assert_eq!(migration.apply(), Err(MigrationError::Configuration));
        return;
    }
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "connection_settings_are_revalidated_when_migrations_start",
        ])
        .env(CHILD, "1")
        .env_remove("PGOPTIONS")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
}
