//! One-time, verified import of Atlas history into SQLx's own ledger.
//! This module never applies migration SQL or modifies the legacy history.
use super::MigrationError;
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256, Sha384};
use sqlx_core::{migrate::Migrator, row::Row};
use sqlx_postgres::PgConnection;
use std::{collections::BTreeMap, path::Path};

struct LegacyHash {
    atlas: String,
    sqlx: Vec<u8>,
}

fn directory_hashes(directory: &Path) -> Result<BTreeMap<i64, LegacyHash>, MigrationError> {
    let mut files = std::fs::read_dir(directory)
        .map_err(|_| MigrationError::Failed)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| MigrationError::Failed)?;
    files.retain(|path| path.extension().is_some_and(|extension| extension == "sql"));
    files.sort();
    let mut cumulative = Sha256::new();
    let mut hashes = BTreeMap::new();
    for path in files {
        // SQLx ignores nonregular sources; the compatibility adapter must not
        // open FIFOs/devices or follow symlinks while validating old history.
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| MigrationError::Failed)?;
        if !metadata.file_type().is_file() {
            return Err(MigrationError::Failed);
        }
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(MigrationError::Failed)?;
        let (version, _) = name.split_once('_').ok_or(MigrationError::Failed)?;
        let version: i64 = version.parse().map_err(|_| MigrationError::Failed)?;
        let bytes = std::fs::read(&path).map_err(|_| MigrationError::Failed)?;
        // The compatibility adapter intentionally rejects Atlas hash directives.
        if bytes
            .windows(b"atlas:sum".len())
            .any(|part| part == b"atlas:sum")
        {
            return Err(MigrationError::Failed);
        }
        cumulative.update(name.as_bytes());
        cumulative.update(&bytes);
        let hash = LegacyHash {
            atlas: STANDARD.encode(cumulative.clone().finalize()),
            sqlx: Sha384::digest(&bytes).to_vec(),
        };
        if hashes.insert(version, hash).is_some() {
            return Err(MigrationError::Failed);
        }
    }
    Ok(hashes)
}

fn validate_revision(
    kind: i64,
    applied: i64,
    total: i64,
    error: &str,
    error_statement: &str,
    hash: &str,
    expected: &str,
) -> Result<(), MigrationError> {
    if kind != 2
        || applied != total
        || total <= 0
        || !error.is_empty()
        || !error_statement.is_empty()
        || hash != expected
    {
        return Err(MigrationError::Failed);
    }
    Ok(())
}

/// Caller owns the SQLx advisory lock and has created its migration table.
pub(super) async fn adopt(
    connection: &mut PgConnection,
    migrator: &Migrator,
    directory: &Path,
) -> Result<(), MigrationError> {
    let schemas: Vec<String> = sqlx_core::query_scalar::query_scalar(
        "SELECT n.nspname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace \
         WHERE c.relname='atlas_schema_revisions' AND c.relkind='r' \
         AND n.nspname=current_schema()",
    ).fetch_all(&mut *connection).await.map_err(|_| MigrationError::Failed)?;
    let schema = match schemas.as_slice() {
        [] => return refuse_untracked_schema(connection).await,
        [schema] => schema,
        _ => return Err(MigrationError::Failed),
    };
    let table = format!(
        "\"{}\".\"atlas_schema_revisions\"",
        schema.replace('"', "\"\"")
    );
    let rows = sqlx_core::query::query(&format!(
        "SELECT version, type::bigint AS kind, applied::bigint AS applied, total::bigint AS total, \
         COALESCE(error,'') AS error, COALESCE(error_stmt,'') AS error_stmt, hash \
         FROM {table} ORDER BY version"
    ))
    .fetch_all(&mut *connection)
    .await
    .map_err(|_| MigrationError::Failed)?;
    if rows.is_empty() {
        return refuse_untracked_schema(connection).await;
    }
    let hashes = directory_hashes(directory)?;
    let migrations = migrator.iter().collect::<Vec<_>>();
    if rows.len() > migrations.len() {
        return Err(MigrationError::Failed);
    }
    // Validate every row before writing anything. Missing/reordered history is
    // not a baseline: only a proven prefix can be imported automatically.
    for (row, migration) in rows.iter().zip(&migrations) {
        let version: String = row.try_get("version").map_err(|_| MigrationError::Failed)?;
        if version.parse::<i64>().ok() != Some(migration.version)
            || version != migration.version.to_string()
        {
            return Err(MigrationError::Failed);
        }
        let hashes = hashes
            .get(&migration.version)
            .ok_or(MigrationError::Failed)?;
        // Reject a directory changed after SQLx resolved its migration bundle.
        if hashes.sqlx.as_slice() != migration.checksum.as_ref() {
            return Err(MigrationError::Failed);
        }
        validate_revision(
            row.try_get("kind").map_err(|_| MigrationError::Failed)?,
            row.try_get("applied").map_err(|_| MigrationError::Failed)?,
            row.try_get("total").map_err(|_| MigrationError::Failed)?,
            row.try_get("error").map_err(|_| MigrationError::Failed)?,
            row.try_get("error_stmt")
                .map_err(|_| MigrationError::Failed)?,
            row.try_get("hash").map_err(|_| MigrationError::Failed)?,
            &hashes.atlas,
        )?;
    }
    import_validated(connection, &migrations[..rows.len()]).await
}

async fn refuse_untracked_schema(connection: &mut PgConnection) -> Result<(), MigrationError> {
    // Atlas's default dedicated namespace does not identify the schema that
    // received the migration SQL. Never assume that its target was public.
    // An operator must verify provenance before relocating that history table
    // into the application schema. Existing SQLx history needs no adoption.
    let unproven_legacy: bool = sqlx_core::query_scalar::query_scalar(
        "SELECT current_schema()='public' AND NOT EXISTS(SELECT 1 FROM _sqlx_migrations) \
         AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace \
         WHERE n.nspname='atlas_schema_revisions' AND c.relname='atlas_schema_revisions' AND c.relkind='r')",
    ).fetch_one(&mut *connection).await.map_err(|_| MigrationError::Failed)?;
    if unproven_legacy {
        return Err(MigrationError::Failed);
    }
    let unsafe_existing: bool = sqlx_core::query_scalar::query_scalar(
        "SELECT NOT EXISTS(SELECT 1 FROM _sqlx_migrations) AND EXISTS(\
         SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace \
         WHERE n.nspname=current_schema() AND c.relkind IN ('r','p') \
         AND c.relname NOT IN ('_sqlx_migrations','atlas_schema_revisions'))",
    ).fetch_one(connection).await.map_err(|_| MigrationError::Failed)?;
    if unsafe_existing {
        Err(MigrationError::Failed)
    } else {
        Ok(())
    }
}

async fn import_validated(
    connection: &mut PgConnection,
    migrations: &[&sqlx_core::migrate::Migration],
) -> Result<(), MigrationError> {
    use sqlx_core::connection::Connection;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|_| MigrationError::Failed)?;
    let existing =
        sqlx_core::query::query("SELECT version, checksum, success FROM _sqlx_migrations")
            .fetch_all(&mut *transaction)
            .await
            .map_err(|_| MigrationError::Failed)?;
    // Never repair a partial/modified SQLx history by filling its holes. Once
    // SQLx has records the complete imported prefix must already be present.
    if !existing.is_empty() {
        for migration in migrations {
            let matching = existing
                .iter()
                .find(|row| row.try_get::<i64, _>("version").ok() == Some(migration.version))
                .ok_or(MigrationError::Failed)?;
            let checksum: Vec<u8> = matching
                .try_get("checksum")
                .map_err(|_| MigrationError::Failed)?;
            let success: bool = matching
                .try_get("success")
                .map_err(|_| MigrationError::Failed)?;
            if !success || checksum.as_slice() != migration.checksum.as_ref() {
                return Err(MigrationError::Failed);
            }
        }
    } else {
        for migration in migrations {
            sqlx_core::query::query("INSERT INTO _sqlx_migrations(version, description, success, checksum, execution_time) VALUES($1,$2,true,$3,0)")
                .bind(migration.version).bind(migration.description.as_ref()).bind(migration.checksum.as_ref())
                .execute(&mut *transaction).await.map_err(|_| MigrationError::Failed)?;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|_| MigrationError::Failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(unix)]
    fn legacy_hashing_rejects_nonregular_sql_sources() {
        let root = std::env::temp_dir().join(format!(
            "appcall_legacy_nonregular_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("202609080001_test.sql");
        std::fs::create_dir(&source).unwrap();
        assert!(directory_hashes(&root).is_err());
        std::fs::remove_dir(&source).unwrap();
        std::os::unix::fs::symlink("/dev/zero", &source).unwrap();
        assert!(directory_hashes(&root).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atlas_hashes_are_cumulative_and_include_filenames() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations");
        let hashes = directory_hashes(&path).unwrap();
        assert_eq!(
            hashes[&202605140001].atlas,
            "Q3VYFwCVYJLb762ptgJSrGH7P6x6ws5r6qwzss0gjS8="
        );
        assert_eq!(
            hashes[&202605140002].atlas,
            "Y9fPyBxvwBJkVzSdaAKj4i83mWD9VIm2NdorgoWZIA0="
        );
    }

    #[test]
    fn incomplete_resolved_and_unproven_legacy_rows_are_rejected() {
        assert!(validate_revision(2, 3, 3, "", "", "hash", "hash").is_ok());
        for kind in [0, 1, 4, 6] {
            assert!(validate_revision(kind, 3, 3, "", "", "hash", "hash").is_err());
        }
        assert!(validate_revision(2, 2, 3, "", "", "hash", "hash").is_err());
        assert!(validate_revision(2, 3, 3, "failed", "", "hash", "hash").is_err());
        assert!(validate_revision(2, 3, 3, "", "SELECT", "hash", "hash").is_err());
        assert!(validate_revision(2, 3, 3, "", "", "other", "hash").is_err());
    }
}
