import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("apollo connector manifest", () => {
  test("declares key, name, runtime, and version", () => {
    expect(manifest.key).toBe("apollo");
    expect(manifest.name).toBe("Apollo");
    expect(manifest.version).toBe("0.1.1");
    expect(manifest.runtime).toBe("bun");
  });

  test("categories include crm", () => {
    expect(manifest.categories).toContain("crm");
  });

  test("auth is api_key with apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    const field = manifest.auth.setup.fields[0];
    expect(field.key).toBe("apiKey");
    expect(field.required).toBe(true);
    expect(field.secret).toBe(true);
  });

  test("network allows api.apollo.io", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.apollo.io"]);
  });

  test("models include person, organization, contact, account", () => {
    expect(manifest.models).toContain("person");
    expect(manifest.models).toContain("organization");
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("account");
  });

  test("healthcheck operation is an action with required fields", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string; inputSchema?: { type: string } }>;
    expect(ops["healthcheck"]).toBeDefined();
    expect(ops["healthcheck"].kind).toBe("action");
    expect(typeof ops["healthcheck"].title).toBe("string");
    expect(typeof ops["healthcheck"].description).toBe("string");
  });

  const actionKeys = [
    "healthcheck",
    "people.search",
    "people.match",
    "people.bulk_match",
    "organizations.search",
    "organizations.enrich",
    "organizations.bulk_enrich",
    "organizations.job_postings",
    "contacts.create",
    "contacts.update",
    "contacts.search",
    "accounts.create",
    "accounts.update",
    "sequences.search",
    "sequences.add_contacts",
    "email_accounts.list",
    "users.search",
    "accounts.search",
    "accounts.get",
    "contacts.get",
    "contacts.update_stage",
    "deals.list",
    "deals.get",
    "deals.create",
    "deals.update",
    "tasks.search",
    "tasks.get",
    "tasks.create",
    "tasks.update",
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
  ];

  test("includes all expected action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    for (const key of actionKeys) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });

  test("describes people.search as sparse candidates and exposes its top-level total", () => {
    const ops = manifest.operations as Record<string, {
      description?: string;
      outputSchema?: { properties?: Record<string, unknown> };
    }>;
    const peopleSearch = ops["people.search"];
    expect(peopleSearch.description).toContain("availability indicators");
    expect(peopleSearch.description).toContain("do not include email addresses or phone numbers");
    expect(peopleSearch.description).toContain("people.match");
    expect(peopleSearch.outputSchema?.properties).toHaveProperty("total_entries");
  });

  test("phone reveal webhook is classified as read-only", () => {
    const ops = manifest.operations as Record<string, { kind: string; sideEffect?: string }>;
    expect(ops["webhook.phone_revealed"].kind).toBe("webhook");
    expect(ops["webhook.phone_revealed"].sideEffect).toBe("read");
  });

  test("all action operations have title and description", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    for (const key of actionKeys) {
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    for (const key of actionKeys) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    for (const key of actionKeys) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
    }
  });
});
