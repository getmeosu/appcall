import { describe, expect, it } from "bun:test";
import { draftFromPiece, collectActions, findPieceDescriptor } from "../piece";
import * as fixtures from "./fixtures/actions";

const piece = {
  displayName: "Fixture",
  auth: { type: "SECRET_TEXT", displayName: "Fixture API key" },
  actions: [
    fixtures.createContact,
    fixtures.getContact,
    fixtures.updateDeal,
    fixtures.archiveDeal,
    fixtures.sdkAction,
  ],
};

describe("collectActions", () => {
  it("accepts an array or a keyed record of actions", () => {
    expect(collectActions(piece as never)).toHaveLength(5);
    expect(collectActions({ actions: { a: fixtures.getContact } } as never)).toHaveLength(1);
  });

  it("drops the generic custom-api-call escape hatch", () => {
    const withEscape = { actions: [fixtures.getContact, { name: "custom_api_call", __customApiCall: true }] };
    expect(collectActions(withEscape as never)).toHaveLength(1);
  });
});

describe("findPieceDescriptor", () => {
  it("picks the export that carries actions", () => {
    expect(findPieceDescriptor({ helper: 1, thePiece: piece } as never)).toBe(piece as never);
  });

  it("returns undefined when no export looks like a piece", () => {
    expect(findPieceDescriptor({ helper: 1 } as never)).toBeUndefined();
  });
});

describe("draftFromPiece", () => {
  it("emits only the operations whose request was recovered", async () => {
    const draft = await draftFromPiece(piece as never, { key: "fixture", categories: ["crm"], models: ["contact"] });
    expect(Object.keys(draft.manifest.operations as Record<string, unknown>).sort())
      .toEqual(["contacts.create", "contacts.get", "deals.update"]);
    expect(draft.stats).toMatchObject({ actions: 5, mechanised: 3 });
  });

  it("lists the actions a human must finish, with reasons", async () => {
    const draft = await draftFromPiece(piece as never, { key: "fixture" });
    const keys = draft.review.map((entry) => entry.key).sort();
    expect(keys).toEqual(["archive-deal.run", "tickets.create"]);
    expect(draft.review.find((entry) => entry.key === "tickets.create")!.reasons.join(" "))
      .toContain("vendor SDK");
  });

  it("lifts the credential out of the operations into http.auth", async () => {
    const draft = await draftFromPiece(piece as never, { key: "fixture", credentialField: "apiKey" });
    const http = draft.manifest.http as Record<string, any>;
    expect(http.auth).toEqual({ field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" });
    for (const operation of Object.values(draft.manifest.operations as Record<string, any>)) {
      expect(JSON.stringify(operation)).not.toContain("__AP_AUTH__");
      expect(JSON.stringify(operation.request.headers ?? {})).not.toContain("Authorization");
    }
  });

  it("derives base URL, allowed hosts, and auth mode from the piece", async () => {
    const draft = await draftFromPiece(piece as never, { key: "fixture" });
    expect((draft.manifest.http as Record<string, unknown>).baseUrl).toBe("https://api.fixture.test");
    expect(draft.manifest.network).toEqual({ allowedHosts: ["api.fixture.test"] });
    expect(draft.manifest.auth).toEqual({
      type: "api_key",
      scopes: [],
      setup: { mode: "api_key", fields: [{ key: "apiKey", label: "Fixture API key", required: true, secret: true }] },
    });
  });

  it("records an oauth2 piece as oauth2", async () => {
    const oauthPiece = { ...piece, auth: { type: "OAUTH2", displayName: "Connect", scope: ["read", "write"] } };
    const draft = await draftFromPiece(oauthPiece as never, { key: "fixture", credentialField: "accessToken" });
    expect(draft.manifest.auth).toMatchObject({ type: "oauth2", scopes: ["read", "write"] });
    expect((draft.manifest.auth as any).setup.mode).toBe("oauth2");
  });

  it("produces operations that satisfy the manifest contract", async () => {
    const draft = await draftFromPiece(piece as never, { key: "fixture" });
    for (const operation of Object.values(draft.manifest.operations as Record<string, any>)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs).toBeGreaterThan(0);
      expect(operation.maxInputBytes).toBeGreaterThan(0);
      expect(operation.maxResponseBytes).toBeGreaterThan(0);
      expect(operation.title.length).toBeGreaterThan(0);
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.inputSchema.type).toBe("object");
      expect(operation.request.method).toBeDefined();
    }
  });
});

describe("draftFromPiece sentinel safety", () => {
  it("never emits an operation still carrying a sentinel", async () => {
    const leaky = {
      displayName: "Leaky",
      auth: { type: "SECRET_TEXT" },
      actions: [
        {
          name: "list_things",
          displayName: "List Things",
          description: "List things.",
          props: {},
          run: async (context: any) => {
            const { httpClient } = await import("../shims/pieces-common");
            return httpClient.sendRequest({
              method: "GET",
              url: "https://api.demo.test/things",
              queryParams: { key: `${context.auth}`, token: `${context.auth}` },
            });
          },
        },
      ],
    };
    const draft = await draftFromPiece(leaky as never, { key: "leaky" });
    expect(JSON.stringify(draft.manifest)).not.toContain("__AP_");
    expect(draft.stats.mechanised).toBe(0);
    expect(draft.review).toHaveLength(1);
  });
});
