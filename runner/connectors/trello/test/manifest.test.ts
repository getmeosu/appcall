import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("trello manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("trello");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("declares api_key setup, since Trello is OAuth 1.0a only and the runner rejects a 1.0a manifest", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
  });

  it("targets the single documented API host", () => {
    expect(manifest.http.baseUrl).toBe("https://api.trello.com/1");
    expect(manifest.network.allowedHosts).toEqual(["api.trello.com"]);
  });

  it("backs off on the documented 10-second window, since no Retry-After header is documented", () => {
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
    expect(manifest.http.errors.defaultRetryAfterSeconds).toBe(10);
  });

  it("reads the provider's own error text from message, falling back to the machine code in error", () => {
    expect(manifest.http.errors.messagePaths).toEqual(["message", "error"]);
  });

  it("declares exactly the 16 operations the brief lists", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "healthcheck",
        "card.create",
        "card.get",
        "card.update",
        "card.delete",
        "card.addComment",
        "card.addChecklist",
        "checklist.addItem",
        "list.create",
        "list.update",
        "list.getCards",
        "board.create",
        "board.getLists",
        "board.getCards",
        "member.getBoards",
        "search.query",
      ].sort(),
    );
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("classifies every mutating operation as a write — a safety control, not metadata", () => {
    const writes = Object.entries(operations)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    expect(writes.length).toBeGreaterThan(0);
    for (const key of writes) {
      expect(operations[key]!.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
    }
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.trello.com");
    }
  });

  it("only interpolates path placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("templates every query and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify([request.query ?? {}, request.body ?? {}]).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!)
        .filter((name) => name.startsWith("input.") === false);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  // --- Connector-specific assertions from the task brief ---

  it("sends both credentials as query parameters, which is what Trello's spec declares", () => {
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("token");
    expect(manifest.http.query.key).toBe("{{apiKey}}");
    // Both must be declared setup fields, or the bundle will not carry them.
    const keys = manifest.auth.setup.fields.map((f: { key: string }) => f.key);
    expect(keys).toContain("apiKey");
    expect(keys).toContain("token");
  });

  it("marks token, not apiKey, as the secret field http.auth.field points at", () => {
    const tokenField = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "token")!;
    const apiKeyField = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "apiKey")!;
    expect(tokenField.secret).toBe(true);
    expect(apiKeyField.secret).not.toBe(true);
    expect(manifest.http.auth.field).toBe("token");
  });

  it("puts write parameters in the query string, because Trello ignores a JSON body", () => {
    for (const [key, op] of Object.entries(operations)) {
      const request = op.request as Record<string, unknown>;
      if (!["POST", "PUT"].includes(String(request.method))) continue;
      expect(request.body, `${key} must not send a JSON body`).toBeUndefined();
      expect(request.query, `${key} must carry its parameters in the query string`).toBeDefined();
    }
  });

  it("keeps the trailing slash board.create needs", () => {
    expect((operations["board.create"]!.request as Record<string, unknown>).path).toBe("/boards/");
    expect((operations["board.create"]!.request as Record<string, unknown>).method).toBe("POST");
  });

  it("requires idList on card.create, since Trello silently drops an unresolved query param", () => {
    const schema = operations["card.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("idList");
  });

  it("requires name and idBoard on list.create", () => {
    const schema = operations["list.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("name");
    expect(schema.required ?? []).toContain("idBoard");
  });

  it("requires name on board.create", () => {
    const schema = operations["board.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("name");
  });

  it("requires text on card.addComment and name on checklist.addItem", () => {
    const commentSchema = operations["card.addComment"]!.inputSchema as { required?: string[] };
    expect(commentSchema.required ?? []).toContain("text");
    const itemSchema = operations["checklist.addItem"]!.inputSchema as { required?: string[] };
    expect(itemSchema.required ?? []).toContain("name");
  });

  it("requires query on search.query", () => {
    const schema = operations["search.query"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("query");
  });

  it("distinguishes card.update's closed=true archive from card.delete's permanent removal in their descriptions", () => {
    const update = String(operations["card.update"]!.description);
    const del = String(operations["card.delete"]!.description);
    expect(update.toLowerCase()).toContain("archive");
    expect(update).toContain("closed");
    expect(del.toLowerCase()).toContain("permanent");
    expect(del.toLowerCase()).not.toContain("archive the card");
  });

  it("documents that member.getBoards accepts an id, a username, or the literal me", () => {
    const description = String(operations["member.getBoards"]!.description);
    expect(description).toContain("me");
  });

  it("does not invent a cursor for the unpaginated collection endpoints", () => {
    const unpaginated = ["list.getCards", "board.getLists", "board.getCards", "member.getBoards"];
    for (const key of unpaginated) {
      const schema = operations[key]!.inputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {}), `${key} must not declare a cursor`).not.toContain("cursor");
      expect(Object.keys(schema.properties ?? {}), `${key} must not declare an offset`).not.toContain("offset");
      expect(String(operations[key]!.description).toLowerCase()).toContain("entire");
    }
  });

  it("paginates search.query with the documented 0-based cardsPage input, not a cursor", () => {
    const schema = operations["search.query"]!.inputSchema as { properties?: Record<string, unknown> };
    // Inputs are camelCase, matching every other operation in this batch
    // (e.g. gitlab maps perPage -> per_page); the provider's snake_case
    // cards_limit/cards_page only appear in request.query, not the tool
    // surface.
    expect(Object.keys(schema.properties ?? {})).toContain("cardsPage");
    expect(Object.keys(schema.properties ?? {})).toContain("cardsLimit");
    expect(Object.keys(schema.properties ?? {})).not.toContain("cards_page");
    expect(Object.keys(schema.properties ?? {})).not.toContain("cards_limit");
    const requestQuery = (operations["search.query"]!.request as Record<string, unknown>).query as Record<string, unknown>;
    expect(requestQuery.cards_limit).toBe("{{cardsLimit}}");
    expect(requestQuery.cards_page).toBe("{{cardsPage}}");
    const description = String(operations["search.query"]!.description);
    expect(description).toContain("0-based");
  });

  it("does not declare a trello.com host, since the authorize redirect is not implemented", () => {
    expect(manifest.network.allowedHosts).not.toContain("trello.com");
  });
});
