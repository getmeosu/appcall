import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const original = ["healthcheck", "account.get", "clients.list", "clients.get", "proposals.list", "templates.list"] as const;
const composioMapped = [
  { tool: "NUSII_PROPOSALS_ARCHIVE_PROPOSAL", operation: "proposals.archive" },
  { tool: "NUSII_PROPOSALS_CREATE_CLIENT", operation: "clients.create" },
  { tool: "NUSII_PROPOSALS_CREATE_LINE_ITEM", operation: "line_items.create" },
  { tool: "NUSII_PROPOSALS_CREATE_PROPOSAL", operation: "proposals.create" },
  { tool: "NUSII_PROPOSALS_CREATE_SECTION", operation: "sections.create" },
  { tool: "NUSII_PROPOSALS_CREATE_WEBHOOK_ENDPOINT", operation: "webhook_endpoints.create" },
  { tool: "NUSII_PROPOSALS_DELETE_CLIENT", operation: "clients.delete" },
  { tool: "NUSII_PROPOSALS_DELETE_LINE_ITEM", operation: "line_items.delete" },
  { tool: "NUSII_PROPOSALS_DELETE_PROPOSAL", operation: "proposals.delete" },
  { tool: "NUSII_PROPOSALS_DELETE_SECTION", operation: "sections.delete" },
  { tool: "NUSII_PROPOSALS_DELETE_WEBHOOK_ENDPOINT", operation: "webhook_endpoints.delete" },
  { tool: "NUSII_PROPOSALS_GET_ACCOUNT_ME", operation: "account.get" },
  { tool: "NUSII_PROPOSALS_GET_CLIENT", operation: "clients.get" },
  { tool: "NUSII_PROPOSALS_GET_PROPOSAL", operation: "proposals.get" },
  { tool: "NUSII_PROPOSALS_GET_SECTION", operation: "sections.get" },
  { tool: "NUSII_PROPOSALS_GET_WEBHOOK_ENDPOINT", operation: "webhook_endpoints.get" },
  { tool: "NUSII_PROPOSALS_LIST_CLIENTS", operation: "clients.list" },
  { tool: "NUSII_PROPOSALS_LIST_LINE_ITEMS", operation: "line_items.list" },
  { tool: "NUSII_PROPOSALS_LIST_PROPOSAL_ACTIVITIES", operation: "proposal_activities.list" },
  { tool: "NUSII_PROPOSALS_LIST_PROPOSALS", operation: "proposals.list" },
  { tool: "NUSII_PROPOSALS_LIST_SECTION_LINE_ITEMS", operation: "line_items.list_for_section" },
  { tool: "NUSII_PROPOSALS_LIST_SECTIONS", operation: "sections.list" },
  { tool: "NUSII_PROPOSALS_LIST_THEMES", operation: "themes.list" },
  { tool: "NUSII_PROPOSALS_LIST_USERS", operation: "users.list" },
  { tool: "NUSII_PROPOSALS_LIST_WEBHOOK_ENDPOINTS", operation: "webhook_endpoints.list" },
  { tool: "NUSII_PROPOSALS_UPDATE_CLIENT", operation: "clients.update" },
  { tool: "NUSII_PROPOSALS_UPDATE_LINE_ITEM", operation: "line_items.update" },
  { tool: "NUSII_PROPOSALS_UPDATE_PROPOSAL", operation: "proposals.update" },
  { tool: "NUSII_PROPOSALS_UPDATE_SECTION", operation: "sections.update" },
];

describe("nusii-proposals manifest", () => {
  test("keeps origin auth, provenance, and the six live ops", () => {
    expect(manifest.key).toBe("nusii-proposals");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://app.nusii.com/api/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Token token={{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["app.nusii.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const key of original) expect(operations[key], key).toBeTruthy();
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(31);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("path placeholders are declared required on inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((m) => m[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("maps every documented Composio NUSII_PROPOSALS tool onto a request-backed operation", () => {
    expect(composioMapped).toHaveLength(29);
    const seen = new Set<string>();
    for (const row of composioMapped as Array<{ tool: string; operation: string }>) {
      expect(operations[row.operation], row.tool).toBeTruthy();
      expect((operations[row.operation].request as { path?: string }).path, row.tool).toBeTruthy();
      seen.add(row.tool);
    }
    expect(seen.size).toBe(29);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/nusii_proposals/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
