import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken", "apiKey": "credapiKey"};
const CASES: Array<[string, string]> = [
  ["actor.run", "actorId"],
  ["actor.run_sync_get_dataset_items", "actorId"],
  ["actors.get", "actorId"],
  ["actors.input_schema", "actorId"],
  ["datasets.delete", "datasetId"],
  ["datasets.get", "datasetId"],
  ["datasets.items", "datasetId"],
  ["datasets.push_items", "datasetId"],
  ["key_value_store.delete_record", "recordKey"],
  ["key_value_store.delete_record", "storeId"],
  ["key_value_store.get_record", "recordKey"],
  ["key_value_store.get_record", "storeId"],
  ["key_value_store.list_keys", "storeId"],
  ["key_value_store.put_record", "recordKey"],
  ["key_value_store.put_record", "storeId"],
  ["key_value_stores.get", "storeId"],
  ["runs.abort", "runId"],
  ["runs.get", "runId"],
  ["runs.list", "actorId"],
  ["runs.log", "runId"],
  ["task.run", "taskId"],
  ["task.run_sync_get_dataset_items", "taskId"],
  ["tasks.get", "taskId"],
];

describe("apify SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("apify", action, field, CREDS);
    });
  }
});
