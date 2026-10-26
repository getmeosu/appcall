import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchPeople } from "../../connectors/apollo/src/actions";
import { handleRPC } from "../src/server";
import { assertOutputSchema } from "../src/declarative/validate";
import { markOperationMetadata, splitOperationMetadata } from "../src/operation-metadata";

// PLAT-OUT-1: result.output is validated by the Rust host against the declared
// outputSchema. It must be the bare handler output; connector/action/sync/source
// ride on the result envelope.
const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../../connectors/ambient-weather/manifest.json"), "utf8"));
const healthcheckSchema = manifest.operations.healthcheck.outputSchema;
const apolloManifest = JSON.parse(readFileSync(join(import.meta.dir, "../../connectors/apollo/manifest.json"), "utf8"));
const apolloPeopleSearchSchema = apolloManifest.operations["people.search"].outputSchema;

let original: typeof fetch;
let providerCalls: string[] = [];
beforeEach(() => {
  original = globalThis.fetch;
  providerCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    providerCalls.push(String(input instanceof Request ? input.url : input));
    return Response.json([{ macAddress: "00:11:22:33:44:55", info: { name: "Yard" } }]);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

async function rpc(method: string, params: Record<string, unknown>) {
  const response = await handleRPC(
    new Request("http://runner.local/rpc", { method: "POST", body: JSON.stringify({ id: "plat-out-1", method, params }) }),
  );
  return { status: response.status, body: (await response.json()) as any };
}

describe("PLAT-OUT-1 action path", () => {
  test("a closed-schema declarative op returns output that validates against its own schema", async () => {
    expect(healthcheckSchema.additionalProperties).toBe(false);
    const { status, body } = await rpc("connector.action.execute", {
      connectorKey: "ambient-weather",
      action: "healthcheck",
      input: { apiKey: "k", applicationKey: "a" },
    });
    expect(status).toBe(200);
    expect(providerCalls).toHaveLength(1);
    expect(body.result.output).toEqual({ data: [{ macAddress: "00:11:22:33:44:55", info: { name: "Yard" } }] });
    expect(() => assertOutputSchema(body.result.output, healthcheckSchema)).not.toThrow();
    expect(body.result.connector).toBe("ambient-weather");
    expect(body.result.action).toBe("healthcheck");
    expect(body.result.source).toBe("provider");
  });

  test("the pre-fix shape ({...output, connector, action}) is exactly what the closed schema rejects", async () => {
    const { body } = await rpc("connector.action.execute", {
      connectorKey: "ambient-weather",
      action: "healthcheck",
      input: { apiKey: "k", applicationKey: "a" },
    });
    const legacy = { ...body.result.output, connector: "ambient-weather", action: "healthcheck", source: "provider" };
    expect(() => assertOutputSchema(legacy, healthcheckSchema)).toThrow("Unexpected property");
  });

  test("registered Apollo people.search returns bare schema-valid data and keeps connector/action on the envelope", async () => {
    const providerResponse = {
      people: [{ id: "person-1", name: "Ada Lovelace" }],
      pagination: { page: 1, per_page: 25, total_entries: 1, next_page_token: "next-page" },
      total_entries: 1,
    };
    let directRequest: Request | undefined;
    const directOutput = await searchPeople({
      q_keywords: "Ada",
      apiKey: "synthetic-apollo-key",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        directRequest = new Request(input, init);
        return Response.json(providerResponse);
      },
    });
    const expectedOutput = {
      data: {
        people: providerResponse.people,
        pagination: {
          ...providerResponse.pagination,
          total_pages: 1,
        },
      },
      total_entries: 1,
    };
    expect(directOutput).toEqual(expectedOutput);
    expect(Reflect.ownKeys(directOutput)).toEqual(["data", "total_entries"]);
    expect(() => assertOutputSchema(directOutput, apolloPeopleSearchSchema)).not.toThrow();
    expect(directRequest?.method).toBe("POST");
    expect(new URL(directRequest!.url).pathname).toBe("/api/v1/mixed_people/api_search");
    expect(await directRequest!.json()).toEqual({ q_keywords: "Ada" });

    const providerRequests: Request[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      providerRequests.push(request);
      return Response.json(providerResponse);
    }) as typeof fetch;

    const { status, body } = await rpc("connector.action.execute", {
      connectorKey: "apollo",
      action: "people.search",
      input: { q_keywords: "Ada", apiKey: "synthetic-apollo-key" },
    });

    expect(status).toBe(200);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0].method).toBe("POST");
    expect(new URL(providerRequests[0].url).pathname).toBe("/api/v1/mixed_people/api_search");
    expect(await providerRequests[0].json()).toEqual({ q_keywords: "Ada" });
    expect(body.result.output).toEqual(expectedOutput);
    expect(body.result.output).not.toHaveProperty("connector");
    expect(body.result.output).not.toHaveProperty("action");
    expect(body.result.output).not.toHaveProperty("source");
    expect(body.result.connector).toBe("apollo");
    expect(body.result.action).toBe("people.search");
    expect(() => assertOutputSchema(body.result.output, apolloPeopleSearchSchema)).not.toThrow();
  });
});

describe("PLAT-OUT-1 sync path", () => {
  test("sync output is the bare page; connector and sync are on the envelope", async () => {
    const { status, body } = await rpc("connector.sync.list", {
      connectorKey: "slack",
      sync: "messages.list",
      input: { channelId: "C123", response: { ok: true, messages: [{ type: "message", user: "U1", text: "hi", ts: "1715680861.000100" }] } },
    });
    expect(status).toBe(200);
    expect(body.result.connector).toBe("slack");
    expect(body.result.sync).toBe("messages.list");
    expect(body.result.output.connector).toBeUndefined();
    expect(body.result.output.sync).toBeUndefined();
    expect(body.result.output.items[0].id).toBe("slack:C123:1715680861.000100");
  });
});

describe("PLAT-OUT-1 metadata marker", () => {
  test("only injected keys are moved; a handler's own same-named key is kept", () => {
    const marked = markOperationMetadata({ connector: "c", action: "a", source: "provider", data: 1 }, ["connector", "action"]);
    expect(Object.keys(marked)).toEqual(["connector", "action", "source", "data"]);
    expect(JSON.parse(JSON.stringify(marked))).toEqual({ connector: "c", action: "a", source: "provider", data: 1 });
    const split = splitOperationMetadata(marked);
    expect(split.output).toEqual({ source: "provider", data: 1 });
    expect(split.metadata).toEqual({ connector: "c", action: "a" });
  });

  test("unmarked (hand-written) output passes through unchanged", () => {
    const output = { connector: "zoom", source: "connector", meeting: { id: 1 } };
    const split = splitOperationMetadata(output);
    expect(split.output).toBe(output);
    expect(split.metadata).toEqual({});
  });
});
