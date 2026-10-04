import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("calendly connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("calendly");
    expect(manifest.name).toBe("Calendly");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is external_bearer with default scopes and no stored fields", () => {
    expect(manifest.auth.type).toBe("external_bearer");
    expect(manifest.auth.scopes).toEqual(["default"]);
    expect(manifest.auth.setup.mode).toBe("external_bearer");
    expect(manifest.auth.setup.fields).toEqual([]);
  });

  test("network allows api.calendly.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.calendly.com"]);
  });

  test("actions stay actions and EventOnly webhooks stay webhooks", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    for (const [key, op] of Object.entries(ops)) {
      if (key.startsWith("webhook.") && !key.startsWith("webhook_subscriptions.")) {
        expect(op.kind).toBe("webhook");
      } else {
        expect(op.kind).toBe("action");
      }
    }
  });

  test("healthcheck declares timeout and size bounds", () => {
    const healthcheck = manifest.operations["healthcheck"];
    expect(healthcheck.timeoutMs).toBe(5000);
    expect(healthcheck.maxInputBytes).toBe(4096);
    expect(healthcheck.maxResponseBytes).toBe(65536);
  });

  test("models include event, user, invitee, and organization", () => {
    expect(manifest.models).toContain("event");
    expect(manifest.models).toContain("user");
    expect(manifest.models).toContain("invitee");
    expect(manifest.models).toContain("organization");
  });

  test("includes all action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    const newActionKeys = [
      "users.me.action",
      "event_types.list",
      "event_types.get",
      "scheduled_events.list",
      "scheduled_events.get",
      "scheduled_events.invitees.list",
      "scheduled_events.cancel",
      "invitees.get",
      "invitee_no_shows.create",
      "scheduling_links.create",
      "slots.available",
      "bookings.create",
      "organization.memberships.list",
      "webhook_subscriptions.create",
      "webhook_subscriptions.list",
      "webhook_subscriptions.delete",
      "users.get",
      "organizations.get",
      "routing_forms.list",
      "routing_forms.get",
    ];
    for (const key of newActionKeys) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("declares EventOnly webhooks without a tool schema", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: unknown }>;
    for (const key of ["webhook.invitee_created", "webhook.invitee_canceled", "webhook.routing_form_submission"]) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("webhook");
      expect(ops[key].inputSchema).toBeUndefined();
    }
  });

  test("all new action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    const newActionKeys = [
      "users.me.action",
      "event_types.list",
      "event_types.get",
      "scheduled_events.list",
      "scheduled_events.get",
      "scheduled_events.invitees.list",
      "scheduled_events.cancel",
      "invitees.get",
      "invitee_no_shows.create",
      "scheduling_links.create",
      "slots.available",
      "bookings.create",
      "organization.memberships.list",
      "webhook_subscriptions.create",
      "webhook_subscriptions.list",
      "webhook_subscriptions.delete",
      "users.get",
      "organizations.get",
      "routing_forms.list",
      "routing_forms.get",
    ];
    for (const key of newActionKeys) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all new action operations have object inputSchema with required array", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const newActionKeys = [
      "users.me.action",
      "event_types.list",
      "event_types.get",
      "scheduled_events.list",
      "scheduled_events.get",
      "scheduled_events.invitees.list",
      "scheduled_events.cancel",
      "invitees.get",
      "invitee_no_shows.create",
      "scheduling_links.create",
      "slots.available",
      "bookings.create",
      "organization.memberships.list",
      "webhook_subscriptions.create",
      "webhook_subscriptions.list",
      "webhook_subscriptions.delete",
      "users.get",
      "organizations.get",
      "routing_forms.list",
      "routing_forms.get",
    ];
    for (const key of newActionKeys) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
      expect(Array.isArray(ops[key].inputSchema!.required)).toBe(true);
    }
  });
});
