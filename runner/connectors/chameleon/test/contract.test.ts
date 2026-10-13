import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../chameleon.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("Chameleon contract", () => {
  test("uses the account secret header on api.chameleon.io only", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.chameleon.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.chameleon.io");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Account-Secret",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);
    expect(coverage.composio_tools).toBe(14);
    expect(Object.keys(manifest.operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
  });

  test("identity is a body-less GET of the account root", async () => {
    const seen: Request[] = [];
    const result = await actions["account.identity.get"]!({
      apiKey: "secret",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ account: { id: "acct" }, user: { id: "admin" } });
      },
    });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.chameleon.io/");
    expect(seen[0].headers.get("x-account-secret")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result.account).toEqual({ id: "acct" });
    expect(result.user).toEqual({ id: "admin" });
  });

  test("encodes a delivery id and does not follow another host", async () => {
    const seen: Request[] = [];
    const result = await actions["deliveries.get"]!({
      apiKey: "secret",
      deliveryId: "del/a",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ delivery: { id: "del/a" } });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v3/edit/delivery/del%2Fa");
    expect(new URL(seen[0].url).hostname).toBe("api.chameleon.io");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(result.delivery).toEqual({ id: "del/a" });
    expect(seen).toHaveLength(1);
  });

  test("lists deliveries with cursor as before and omits absent filters", async () => {
    const seen: Request[] = [];
    await actions["deliveries.list"]!({
      apiKey: "secret",
      limit: 10,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ deliveries: [] });
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("GET");
    expect(url.pathname).toBe("/v3/edit/deliveries");
    expect(url.search).toBe("?limit=10");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("tracks one event as JSON with exactly one profile selector", async () => {
    const seen: Request[] = [];
    const result = await actions["events.track"]!({
      apiKey: "secret",
      eventName: "Imported Data",
      profileId: "5f3c4232c712de665632a6d5",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ event: { id: "evt_1" } }, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/v3/observe/hooks/events");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"id":"5f3c4232c712de665632a6d5","name":"Imported Data"}');
    expect(result.event).toEqual({ id: "evt_1" });
    await expect(actions["events.track"]!({
      apiKey: "secret",
      eventName: "Imported Data",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["events.track"]!({
      apiKey: "secret",
      eventName: "Imported Data",
      profileId: "5f3c4232c712de665632a6d5",
      profileUid: "18821",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("rejects a free-form URL, a dot segment, bad limits, malformed JSON, 403, and 429", async () => {
    await expect(actions["deliveries.get"]!({
      apiKey: "secret",
      deliveryId: "5f3c4232c712de665632a6d8",
      url: "https://evil.example/delivery",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["deliveries.get"]!({
      apiKey: "secret",
      deliveryId: "..",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["deliveries.list"]!({
      apiKey: "secret",
      limit: 0,
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["deliveries.list"]!({
      apiKey: "secret",
      limit: 501,
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["account.identity.get"]!({
      apiKey: "secret",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["account.identity.get"]!({
      apiKey: "secret",
      fetch: async () => json({ code: 403, messages: ["Unauthorized: Please check your Chameleon Account Secret"] }, 403),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["deliveries.list"]!({
      apiKey: "secret",
      fetch: async () => json({ code: 429, messages: ["Rate Limited"], wait: 14 }, 429, { "X-Ratelimit-Wait": "9" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 14 });
    await expect(actions["deliveries.list"]!({
      apiKey: "secret",
      fetch: async () => json({ code: 429, messages: ["Rate Limited"] }, 429, { "X-Ratelimit-Wait": "9" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
