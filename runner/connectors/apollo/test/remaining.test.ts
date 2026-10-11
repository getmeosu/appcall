import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import sequences_activate from "../fixtures/sequence_activate.json";
import sequences_deactivate from "../fixtures/sequence_deactivate.json";
import sequences_archive from "../fixtures/sequence_archive.json";
import accounts_update_stage from "../fixtures/account_update_stage.json";
import tasks_complete from "../fixtures/task_complete.json";
import accounts_bulk_create from "../fixtures/account_bulk_create.json";
import contacts_bulk_create from "../fixtures/contact_bulk_create.json";
import calls_create from "../fixtures/call_create.json";
import custom_fields_create from "../fixtures/custom_field_create.json";
import emails_create_draft from "../fixtures/email_create_draft.json";
import sequences_create from "../fixtures/sequence_create.json";
import conversations_export from "../fixtures/conversation_export.json";
import conversations_get from "../fixtures/conversation_get.json";
import conversations_get_export from "../fixtures/conversation_get_export.json";
import emails_get_activities from "../fixtures/email_activities.json";
import emails_get_content from "../fixtures/email_content.json";
import labels_list from "../fixtures/labels_list.json";
import deals_list_stages from "../fixtures/deal_stages.json";
import organizations_get from "../fixtures/organization_get.json";
import custom_fields_list from "../fixtures/custom_fields_list.json";
import account_stages_list from "../fixtures/account_stages.json";
import contact_stages_list from "../fixtures/contact_stages.json";
import fields_list from "../fixtures/fields_list.json";
import notes_list from "../fixtures/notes_list.json";
import analytics_query from "../fixtures/analytics_query.json";
import calls_search from "../fixtures/call_search.json";
import conversations_search from "../fixtures/conversation_search.json";
import news_search from "../fixtures/news_search.json";
import emails_search from "../fixtures/email_search.json";
import emails_send_now from "../fixtures/email_send_now.json";
import accounts_update_owners from "../fixtures/account_update_owners.json";
import calls_update from "../fixtures/call_update.json";
import contacts_update_owners from "../fixtures/contact_update_owners.json";
import contacts_bulk_update from "../fixtures/contact_bulk_update.json";
import sequences_update_contact_status from "../fixtures/sequence_update_contact_status.json";
import sequences_update from "../fixtures/sequence_update.json";
import usage_api_stats from "../fixtures/usage_api_stats.json";
import usage_credit_stats from "../fixtures/usage_credit_stats.json";

const compiled = compileDeclarativeConnector(
  manifest as unknown as Parameters<typeof compileDeclarativeConnector>[0],
);

type Scenario = {
  operation: string;
  input: Record<string, unknown>;
  method: string;
  path: string;
  query?: Record<string, string | string[]>;
  body?: Record<string, unknown>;
  response: unknown;
  sideEffect: "read" | "write";
};

const writeOps = new Set([
  "accounts.bulk_create",
  "accounts.update_owners",
  "accounts.update_stage",
  "calls.create",
  "calls.update",
  "contacts.bulk_create",
  "contacts.bulk_update",
  "contacts.update_owners",
  "conversations.export",
  "custom_fields.create",
  "emails.create_draft",
  "emails.send_now",
  "sequences.activate",
  "sequences.archive",
  "sequences.create",
  "sequences.deactivate",
  "sequences.update",
  "sequences.update_contact_status",
  "tasks.complete",
]);

const remainingOps = [
  "sequences.activate",
  "sequences.deactivate",
  "sequences.archive",
  "accounts.update_stage",
  "tasks.complete",
  "accounts.bulk_create",
  "contacts.bulk_create",
  "calls.create",
  "custom_fields.create",
  "emails.create_draft",
  "sequences.create",
  "conversations.export",
  "conversations.get",
  "conversations.get_export",
  "emails.get_activities",
  "emails.get_content",
  "labels.list",
  "deals.list_stages",
  "organizations.get",
  "custom_fields.list",
  "account_stages.list",
  "contact_stages.list",
  "fields.list",
  "notes.list",
  "analytics.query",
  "calls.search",
  "conversations.search",
  "news.search",
  "emails.search",
  "emails.send_now",
  "accounts.update_owners",
  "calls.update",
  "contacts.update_owners",
  "contacts.bulk_update",
  "sequences.update_contact_status",
  "sequences.update",
  "usage.api_stats",
  "usage.credit_stats",
] as const;

const scenarios: Scenario[] = [
  { operation: "sequences.activate", input: {"sequence_id": "seq_001"} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_campaigns/seq_001/approve", response: sequences_activate, sideEffect: writeOps.has("sequences.activate") ? "write" : "read" },
  { operation: "sequences.deactivate", input: {"sequence_id": "seq_001"} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_campaigns/seq_001/abort", response: sequences_deactivate, sideEffect: writeOps.has("sequences.deactivate") ? "write" : "read" },
  { operation: "sequences.archive", input: {"sequence_id": "seq_001"} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_campaigns/seq_001/archive", response: sequences_archive, sideEffect: writeOps.has("sequences.archive") ? "write" : "read" },
  { operation: "accounts.update_stage", input: {"account_ids": ["acc_001", "acc_002"], "account_stage_id": "stage_001"} as Record<string, unknown>, method: "POST", path: "/api/v1/accounts/bulk_update", body: {"account_ids": ["acc_001", "acc_002"], "account_stage_id": "stage_001"}, response: accounts_update_stage, sideEffect: writeOps.has("accounts.update_stage") ? "write" : "read" },
  { operation: "tasks.complete", input: {"id": "task_001", "note": "Left a voicemail"} as Record<string, unknown>, method: "POST", path: "/api/v1/tasks/task_001/complete", body: {"note": "Left a voicemail"}, response: tasks_complete, sideEffect: writeOps.has("tasks.complete") ? "write" : "read" },
  { operation: "accounts.bulk_create", input: {"accounts": [{"name": "Acme Corporation", "domain": "acme.com", "phone": "+1-555-0135"}], "run_dedupe": true} as Record<string, unknown>, method: "POST", path: "/api/v1/accounts/bulk_create", body: {"accounts": [{"name": "Acme Corporation", "domain": "acme.com", "phone": "+1-555-0135"}], "run_dedupe": true}, response: accounts_bulk_create, sideEffect: writeOps.has("accounts.bulk_create") ? "write" : "read" },
  { operation: "contacts.bulk_create", input: {"contacts": [{"first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com"}], "run_dedupe": true} as Record<string, unknown>, method: "POST", path: "/api/v1/contacts/bulk_create", body: {"contacts": [{"first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com"}], "run_dedupe": true}, response: contacts_bulk_create, sideEffect: writeOps.has("contacts.bulk_create") ? "write" : "read" },
  { operation: "calls.create", input: {"contact_id": "con_001", "account_id": "acc_001", "status": "completed", "duration": 42, "user_id": ["user_001"], "logged": true, "note": "Connected"} as Record<string, unknown>, method: "POST", path: "/api/v1/phone_calls", query: {"note": "Connected", "logged": "true", "status": "completed", "user_id[]": "user_001", "duration": "42", "account_id": "acc_001", "contact_id": "con_001"}, response: calls_create, sideEffect: writeOps.has("calls.create") ? "write" : "read" },
  { operation: "custom_fields.create", input: {"label": "Launch Date", "type": "date", "modality": "contact"} as Record<string, unknown>, method: "POST", path: "/api/v1/fields", body: {"label": "Launch Date", "type": "date", "modality": "contact"}, response: custom_fields_create, sideEffect: writeOps.has("custom_fields.create") ? "write" : "read" },
  { operation: "emails.create_draft", input: {"contact_id": "con_001", "subject": "Quick question", "body_html": "<p>Hello Ada</p>", "enable_tracking": true} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_messages", body: {"contact_id": "con_001", "subject": "Quick question", "body_html": "<p>Hello Ada</p>", "enable_tracking": true}, response: emails_create_draft, sideEffect: writeOps.has("emails.create_draft") ? "write" : "read" },
  { operation: "sequences.create", input: {"name": "Q3 Outbound", "active": false, "max_emails_per_day": 50, "emailer_steps": [{"type": "auto_email", "wait_time": 1, "wait_mode": "day", "emailer_touches": [{"type": "new_thread", "status": "approved"}]}]} as Record<string, unknown>, method: "POST", path: "/api/v1/sequences", body: {"name": "Q3 Outbound", "active": false, "emailer_steps": [{"type": "auto_email", "wait_time": 1, "wait_mode": "day", "emailer_touches": [{"type": "new_thread", "status": "approved"}]}], "max_emails_per_day": 50}, response: sequences_create, sideEffect: writeOps.has("sequences.create") ? "write" : "read" },
  { operation: "conversations.export", input: {"start_time": "2024-01-01T00:00:00Z", "end_time": "2024-03-31T23:59:59Z", "email": "ops@example.com"} as Record<string, unknown>, method: "POST", path: "/api/v1/conversations/export", body: {"start_time": "2024-01-01T00:00:00Z", "end_time": "2024-03-31T23:59:59Z", "email": "ops@example.com"}, response: conversations_export, sideEffect: writeOps.has("conversations.export") ? "write" : "read" },
  { operation: "conversations.get", input: {"conversation_id": "conv_001"} as Record<string, unknown>, method: "GET", path: "/api/v1/conversations/conv_001", response: conversations_get, sideEffect: writeOps.has("conversations.get") ? "write" : "read" },
  { operation: "conversations.get_export", input: {"export_id": "export_001"} as Record<string, unknown>, method: "GET", path: "/api/v1/conversations/export/export_001", response: conversations_get_export, sideEffect: writeOps.has("conversations.get_export") ? "write" : "read" },
  { operation: "emails.get_activities", input: {"email_id": "msg_001"} as Record<string, unknown>, method: "GET", path: "/api/v1/emailer_messages/msg_001/activities", response: emails_get_activities, sideEffect: writeOps.has("emails.get_activities") ? "write" : "read" },
  { operation: "emails.get_content", input: {"ids": ["msg_001"], "body_format": "plain"} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_messages/get_content", body: {"ids": ["msg_001"], "body_format": "plain"}, response: emails_get_content, sideEffect: writeOps.has("emails.get_content") ? "write" : "read" },
  { operation: "labels.list", input: {} as Record<string, unknown>, method: "GET", path: "/api/v1/labels", response: labels_list, sideEffect: writeOps.has("labels.list") ? "write" : "read" },
  { operation: "deals.list_stages", input: {} as Record<string, unknown>, method: "GET", path: "/api/v1/opportunity_stages", response: deals_list_stages, sideEffect: writeOps.has("deals.list_stages") ? "write" : "read" },
  { operation: "organizations.get", input: {"id": "org_001"} as Record<string, unknown>, method: "GET", path: "/api/v1/organizations/org_001", response: organizations_get, sideEffect: writeOps.has("organizations.get") ? "write" : "read" },
  { operation: "custom_fields.list", input: {} as Record<string, unknown>, method: "GET", path: "/api/v1/typed_custom_fields", response: custom_fields_list, sideEffect: writeOps.has("custom_fields.list") ? "write" : "read" },
  { operation: "account_stages.list", input: {} as Record<string, unknown>, method: "GET", path: "/api/v1/account_stages", response: account_stages_list, sideEffect: writeOps.has("account_stages.list") ? "write" : "read" },
  { operation: "contact_stages.list", input: {} as Record<string, unknown>, method: "GET", path: "/api/v1/contact_stages", response: contact_stages_list, sideEffect: writeOps.has("contact_stages.list") ? "write" : "read" },
  { operation: "fields.list", input: {"source": "custom"} as Record<string, unknown>, method: "GET", path: "/api/v1/fields", query: {"source": "custom"}, response: fields_list, sideEffect: writeOps.has("fields.list") ? "write" : "read" },
  { operation: "notes.list", input: {"contact_id": "con_001", "limit": 25, "skip": 0, "sort_by_field": "created_at", "sort_direction": "desc"} as Record<string, unknown>, method: "GET", path: "/api/v1/notes", query: {"skip": "0", "limit": "25", "contact_id": "con_001", "sort_by_field": "created_at", "sort_direction": "desc"}, response: notes_list, sideEffect: writeOps.has("notes.list") ? "write" : "read" },
  { operation: "analytics.query", input: {"metrics": [{"value": "num_emails_sent", "smart_datetime_reference": "activity_datetime", "smart_user_id_reference": "user_id"}], "group_by": [], "sorts": [], "filters": {}, "date_ranges": [{"modality": "last_30_days"}], "group_by_totals_selected": false, "pivot_group_by_totals_selected": false} as Record<string, unknown>, method: "POST", path: "/api/v1/reports/sync_report", body: {"metrics": [{"value": "num_emails_sent", "smart_datetime_reference": "activity_datetime", "smart_user_id_reference": "user_id"}], "group_by": [], "sorts": [], "filters": {}, "date_ranges": [{"modality": "last_30_days"}], "group_by_totals_selected": false, "pivot_group_by_totals_selected": false}, response: analytics_query, sideEffect: writeOps.has("analytics.query") ? "write" : "read" },
  { operation: "calls.search", input: {"page": 1, "per_page": 10, "inbound": "outgoing", "user_ids": ["user_001"], "date_range_min": "2024-01-01", "date_range_max": "2024-03-31", "duration_min": 10, "duration_max": 300, "q_keywords": "demo"} as Record<string, unknown>, method: "GET", path: "/api/v1/phone_calls/search", query: {"page": "1", "per_page": "10", "inbound": "outgoing", "user_ids[]": "user_001", "q_keywords": "demo", "duration[max]": "300", "duration[min]": "10", "date_range[max]": "2024-03-31", "date_range[min]": "2024-01-01"}, response: calls_search, sideEffect: writeOps.has("calls.search") ? "write" : "read" },
  { operation: "conversations.search", input: {"page": 1, "num_fetch_result": 20, "conversation_type": "video_conference", "contact_ids": ["con_001"], "date_range": {"start": "2024-01-01T00:00:00Z", "end": "2024-03-31T23:59:59Z"}} as Record<string, unknown>, method: "POST", path: "/api/v1/conversations/search", body: {"page": 1, "num_fetch_result": 20, "date_range": {"start": "2024-01-01T00:00:00Z", "end": "2024-03-31T23:59:59Z"}, "contact_ids": ["con_001"], "conversation_type": "video_conference"}, response: conversations_search, sideEffect: writeOps.has("conversations.search") ? "write" : "read" },
  { operation: "news.search", input: {"organization_ids": ["org_001"], "categories": ["investment"], "published_at_min": "2024-01-01", "published_at_max": "2024-12-31", "page": 1, "per_page": 10} as Record<string, unknown>, method: "POST", path: "/api/v1/news_articles/search", query: {"organization_ids[]": "org_001", "categories[]": "investment", "published_at[min]": "2024-01-01", "published_at[max]": "2024-12-31", "page": "1", "per_page": "10"}, response: news_search, sideEffect: writeOps.has("news.search") ? "write" : "read" },
  { operation: "emails.search", input: {"page": 1, "per_page": 25, "user_ids": ["user_001"], "emailer_campaign_ids": ["seq_001"], "emailer_message_stats": ["delivered"]} as Record<string, unknown>, method: "GET", path: "/api/v1/emailer_messages/search", query: {"page": "1", "per_page": "25", "user_ids[]": "user_001", "emailer_campaign_ids[]": "seq_001", "emailer_message_stats[]": "delivered"}, response: emails_search, sideEffect: writeOps.has("emails.search") ? "write" : "read" },
  { operation: "emails.send_now", input: {"id": "msg_001", "surface": "api"} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_messages/msg_001/send_now", body: {"surface": "api"}, response: emails_send_now, sideEffect: writeOps.has("emails.send_now") ? "write" : "read" },
  { operation: "accounts.update_owners", input: {"owner_id": "user_001", "account_ids": ["acc_001", "acc_002"]} as Record<string, unknown>, method: "POST", path: "/api/v1/accounts/update_owners", query: {"owner_id": "user_001", "account_ids[]": ["acc_001", "acc_002"]}, response: accounts_update_owners, sideEffect: writeOps.has("accounts.update_owners") ? "write" : "read" },
  { operation: "calls.update", input: {"id": "call_001", "status": "completed", "duration": 90, "note": "Connected", "contact_id": "con_001"} as Record<string, unknown>, method: "PUT", path: "/api/v1/phone_calls/call_001", query: {"note": "Connected", "status": "completed", "duration": "90", "contact_id": "con_001"}, response: calls_update, sideEffect: writeOps.has("calls.update") ? "write" : "read" },
  { operation: "contacts.update_owners", input: {"owner_id": "user_001", "contact_ids": ["con_001", "con_002"]} as Record<string, unknown>, method: "POST", path: "/api/v1/contacts/update_owners", query: {"owner_id": "user_001", "contact_ids[]": ["con_001", "con_002"]}, response: contacts_update_owners, sideEffect: writeOps.has("contacts.update_owners") ? "write" : "read" },
  { operation: "contacts.bulk_update", input: {"contact_ids": ["con_001", "con_002"], "title": "VP Sales"} as Record<string, unknown>, method: "POST", path: "/api/v1/contacts/bulk_update", body: {"title": "VP Sales", "contact_ids": ["con_001", "con_002"]}, response: contacts_bulk_update, sideEffect: writeOps.has("contacts.bulk_update") ? "write" : "read" },
  { operation: "sequences.update_contact_status", input: {"emailer_campaign_ids": ["seq_001"], "contact_ids": ["con_001"], "mode": "mark_as_finished"} as Record<string, unknown>, method: "POST", path: "/api/v1/emailer_campaigns/remove_or_stop_contact_ids", query: {"emailer_campaign_ids[]": "seq_001", "contact_ids[]": "con_001", "mode": "mark_as_finished"}, response: sequences_update_contact_status, sideEffect: writeOps.has("sequences.update_contact_status") ? "write" : "read" },
  { operation: "sequences.update", input: {"id": "seq_001", "name": "Q3 Outbound (revised)", "max_emails_per_day": 50, "active": true} as Record<string, unknown>, method: "PUT", path: "/api/v1/sequences/seq_001", body: {"name": "Q3 Outbound (revised)", "active": true, "max_emails_per_day": 50}, response: sequences_update, sideEffect: writeOps.has("sequences.update") ? "write" : "read" },
  { operation: "usage.api_stats", input: {} as Record<string, unknown>, method: "POST", path: "/api/v1/usage_stats/api_usage_stats", response: usage_api_stats, sideEffect: writeOps.has("usage.api_stats") ? "write" : "read" },
  { operation: "usage.credit_stats", input: {} as Record<string, unknown>, method: "POST", path: "/api/v1/usage_stats/credit_usage_stats", response: usage_credit_stats, sideEffect: writeOps.has("usage.credit_stats") ? "write" : "read" },
];

describe("Apollo remaining Composio tools", () => {
  test("declares every remaining Composio action with a real request block", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const operation of remainingOps) {
      const definition = ops[operation];
      expect(definition).toBeDefined();
      expect(definition.kind).toBe("action");
      expect(definition.title).toBeString();
      expect(definition.description).toBeString();
      expect(definition.request).toBeDefined();
      expect(definition.validationMode).toBe("strict-generated");
      expect(definition.responseFormat).toBe("json");
      expect(definition.enforceOutputSchema).toBe(true);
      expect(definition.sideEffect).toBe(writeOps.has(operation) ? "write" : "read");
    }
  });

  for (const scenario of scenarios) {
    test(`${scenario.operation} sends its documented request and returns the provider fixture`, async () => {
      const handler = compiled.actions[scenario.operation];
      expect(handler).toBeDefined();
      let captured: Request | undefined;
      const result = await handler({
        ...scenario.input,
        apiKey: "test_apollo_key",
        fetch: async (input, init) => {
          captured = new Request(input, init);
          return new Response(JSON.stringify(scenario.response), { status: 200, headers: { "content-type": "application/json" } });
        },
      });
      expect(captured).toBeDefined();
      expect(captured!.method).toBe(scenario.method);
      expect(new URL(captured!.url).origin).toBe("https://api.apollo.io");
      expect(new URL(captured!.url).pathname).toBe(scenario.path);
      expect(captured!.headers.get("x-api-key")).toBe("test_apollo_key");
      if (scenario.query) {
        const query = new URL(captured!.url).searchParams;
        for (const [key, expected] of Object.entries(scenario.query)) {
          expect(query.getAll(key)).toEqual(Array.isArray(expected) ? expected : [expected]);
        }
      }
      if (scenario.body) expect(await captured!.json()).toEqual(scenario.body);
      else expect(await captured!.text()).toBe("");
      expect(result.data).toEqual(scenario.response);
    });
  }

  test("path identifiers reject traversal tokens before a provider call", async () => {
    let requests = 0;
    await expect(compiled.actions["organizations.get"]({
      id: "..",
      apiKey: "test_apollo_key",
      fetch: async () => { requests += 1; return new Response("{}", { status: 200 }); },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(requests).toBe(0);
  });

  for (const [operation, input] of [
    ["accounts.update_stage", { account_ids: [42], account_stage_id: "stage_001" }],
    ["news.search", { organization_ids: [42] }],
    ["sequences.update_contact_status", { emailer_campaign_ids: ["seq_001"], contact_ids: [42], mode: "remove" }],
  ] as const) {
    test(`${operation} rejects nonstring array members before making an HTTP request`, async () => {
      let requests = 0;
      await expect(compiled.actions[operation]({
        ...input,
        apiKey: "test_apollo_key",
        fetch: async () => { requests += 1; return new Response("{}", { status: 200 }); },
      })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
      expect(requests).toBe(0);
    });
  }

  for (const [operation, input] of [
    ["calls.create", { status: "missed" }],
    ["custom_fields.create", { label: "Launch Date", type: "currency" }],
    ["sequences.update_contact_status", { emailer_campaign_ids: ["seq_001"], contact_ids: ["con_001"], mode: "active" }],
    ["fields.list", { source: "unknown" }],
  ] as const) {
    test(`${operation} rejects unsupported enum values before making an HTTP request`, async () => {
      let requests = 0;
      await expect(compiled.actions[operation]({
        ...input,
        apiKey: "test_apollo_key",
        fetch: async () => { requests += 1; return new Response("{}", { status: 200 }); },
      })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
      expect(requests).toBe(0);
    });
  }
});
