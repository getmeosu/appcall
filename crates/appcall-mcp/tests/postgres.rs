use appcall_mcp::{ConnectionLister, PgConnections};
#[test]
fn postgres_lister_runs_on_async_host_and_filters_project() {
    let Ok(url) = std::env::var("APPCALL_TEST_DATABASE_URL") else {
        return;
    };
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    client.batch_execute("CREATE TEMP TABLE connections(id text, project_id text,external_account_id text,connector text,status text);INSERT INTO connections VALUES ('c','p','brand','slack','active'),('other','other','brand','slack','active')").unwrap();
    let lister = PgConnections::new(std::sync::Arc::new(std::sync::Mutex::new(client)));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let connections = runtime.block_on(lister.list("p")).unwrap();
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0].id, "c");
}
