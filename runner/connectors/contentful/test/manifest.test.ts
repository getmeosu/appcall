import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const originOperationIds = [
  "healthcheck",
  "spaces.list",
  "environments.list",
  "entries.list",
  "content_types.list",
  "content_types.activate",
  "assets.archive",
  "entries.archive",
  "releases.archive",
  "app_definitions.keys.create",
  "content_types.create",
  "entries.tasks.create",
  "environments.create",
  "locales.create",
  "app_definitions.access_grants.create",
  "app_definitions.create",
  "app_definitions.actions.create",
  "organizations.invitations.create",
  "organizations.security_contacts.create",
  "taxonomy.concepts.create",
  "taxonomy.concept_schemes.create",
  "releases.create",
  "spaces.create",
  "api_keys.create",
  "assets.create",
  "entries.create",
  "entries.comments.create",
  "extensions.create",
  "scheduled_actions.create",
  "webhooks.create",
  "assets.delete",
  "content_types.delete",
  "entries.delete",
  "environments.delete",
  "extensions.delete",
  "locales.delete",
  "app_definitions.event_subscriptions.delete",
  "app_definitions.details.delete",
  "app_definitions.keys.delete",
  "app_definitions.signing_secret.delete",
  "organizations.security_contacts.delete",
  "releases.delete",
  "scheduled_actions.delete",
  "space_memberships.delete",
  "api_keys.delete",
  "uploads.delete",
  "tags.delete",
  "webhooks.delete",
  "app_definitions.bundles.get",
  "app_definitions.get",
  "assets.get",
  "content_types.snapshots.get",
  "content_types.snapshots.list",
  "editor_interfaces.get",
  "entries.get",
  "entries.comments.get",
  "entries.references.get",
  "entries.snapshots.list",
  "environments.get",
  "organizations.get",
  "organizations.access_grants.get",
  "organizations.list",
  "organizations.ai_providers.list",
  "organizations.app_action_categories.list",
  "app_definitions.event_subscriptions.get",
  "app_definitions.list",
  "app_definitions.access_grants.list",
  "app_definitions.actions.list",
  "app_definitions.actions.get",
  "app_definitions.bundles.list",
  "app_definitions.functions.list",
  "app_definitions.keys.list",
  "app_definitions.signing_secret.get",
  "organizations.enablements.get",
  "organizations.invitations.get",
  "organizations.periodic_usages.list",
  "organizations.roles.list",
  "organizations.security_contacts.list",
  "organizations.space_enablements.list",
  "organizations.space_periodic_usages.list",
  "taxonomy.concepts.list",
  "taxonomy.concepts.ancestors.list",
  "taxonomy.concept_schemes.list",
  "taxonomy.concept_schemes.get",
  "taxonomy.concept_schemes.total.get",
  "taxonomy.concepts.total.get",
  "releases.get",
  "spaces.get",
  "space_memberships.list",
  "api_keys.list",
  "app_installations.list",
  "assets.list",
  "locales.list",
  "app_installations.functions.list",
  "webhooks.get",
  "webhooks.calls.list",
  "webhooks.health.get",
  "roles.list",
  "webhooks.list",
  "assets.process",
  "assets.publish",
  "entries.publish",
  "assets.queryCollection",
  "graphql.query",
  "entries.unarchive",
  "content_types.unpublish",
  "app_definitions.update",
  "content_types.update",
  "editor_interfaces.update",
  "entries.update",
  "locales.update",
  "app_definitions.event_subscriptions.update",
  "app_definitions.actions.update",
  "app_definitions.details.update",
  "app_definitions.signing_secret.update",
  "organizations.enablements.update",
  "organizations.security_contacts.update",
  "taxonomy.concepts.update",
  "taxonomy.concept_schemes.update",
  "spaces.update",
  "tags.update",
  "webhooks.update",
  "bulk_actions.validate",
  "users.me"
] as const;

describe("contentful manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("contentful");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.contentful.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({
      Accept: "application/vnd.contentful.management.v1+json",
      "Content-Type": "application/vnd.contentful.management.v1+json",
    });
    expect(manifest.network.allowedHosts).toEqual([
      "api.contentful.com",
      "graphql.contentful.com",
      "upload.contentful.com",
    ]);
  });

  it("keeps every origin operation", () => {
    expect(originOperationIds).toHaveLength(124);
    for (const id of originOperationIds) {
      expect(operations[id], id).toBeDefined();
    }
  });

  it("adds the four documented api.contentful.com routes", () => {
    expect(Object.keys(operations)).toHaveLength(128);
    const added: Record<string, { method: string; path: string; sideEffect: string }> = {
      "environments.create.auto": {
        method: "POST",
        path: "/spaces/{{space_id}}/environments",
        sideEffect: "write",
      },
      "content_types.snapshots.get.environment": {
        method: "GET",
        path: "/spaces/{{space_id}}/environments/{{environment_id}}/content_types/{{content_type_id}}/snapshots/{{snapshot_id}}",
        sideEffect: "read",
      },
      "organizations.access_grant.get": {
        method: "GET",
        path: "/organizations/{{organization_id}}/access_grant",
        sideEffect: "read",
      },
      "organizations.app_actions_categories.list": {
        method: "GET",
        path: "/organizations/{{organization_id}}/app_actions_categories",
        sideEffect: "read",
      },
    };
    for (const [id, want] of Object.entries(added)) {
      const operation = operations[id] as {
        sideEffect: string;
        timeoutMs: number;
        maxInputBytes: number;
        maxResponseBytes: number;
        inputSchema: { additionalProperties?: boolean };
        request: { method: string; path: string; body?: unknown; headers?: Record<string, string> };
      };
      expect(operation, id).toBeDefined();
      expect(operation.request.method, id).toBe(want.method);
      expect(operation.request.path, id).toBe(want.path);
      expect(operation.sideEffect, id).toBe(want.sideEffect);
      expect(operation.inputSchema.additionalProperties, id).toBe(false);
      expect(operation.timeoutMs, id).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, id).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, id).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, id).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect((operation as { outputSchema?: { type?: string } }).outputSchema?.type, id).toBe("object");
      expect(operation.request.headers?.["Content-Type"], id).toBeUndefined();
      if (want.method === "GET") {
        expect(operation.request.body, id).toBeUndefined();
      } else {
        expect(operation.request.body, id).toEqual({ name: "{{name}}" });
        expect(operation.request.headers, id).toEqual({
          "X-Contentful-Source-Environment": "{{source_environment_id}}",
        });
      }
    }
    const create = operations["environments.create"] as { request: { method: string; path: string } };
    expect(create.request.method).toBe("PUT");
    expect(create.request.path).toBe("/spaces/{{spaceId}}/environments/{{environmentId}}");
    const masterSnapshot = operations["content_types.snapshots.get"] as { request: { path: string } };
    expect(masterSnapshot.request.path).toBe(
      "/spaces/{{spaceId}}/environments/master/content_types/{{contentTypeId}}/snapshots/{{snapshotId}}",
    );
    const grants = operations["organizations.access_grants.get"] as { request: { path: string } };
    expect(grants.request.path).toBe("/organizations/{{organizationId}}/access_grants");
    const legacyCategories = operations["organizations.app_action_categories.list"] as {
      request: { path: string };
    };
    expect(legacyCategories.request.path).toBe(
      "/organizations/{{organizationId}}/app_action_categories",
    );
  });

  it("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(128);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect((operation.request as { path?: string }).path, key).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (operation.kind === "webhook") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
