import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("beaconchain declarative Composio contract", () => {
  test("compiles every declared action with a request block", () => {
    const compiled = Object.keys(actions).sort();
    const declared = Object.entries(manifest.operations)
      .filter(([, op]) => (op as { kind: string }).kind === "action" && (op as { request?: unknown }).request)
      .map(([key]) => key)
      .sort();
    expect(compiled).toEqual(declared);
    expect(compiled.length).toBe(Object.keys(manifest.operations).length);
  });

  test("origin healthcheck keeps Bearer V2 queues", async () => {
    const seen: Request[] = [];
    const body = { data: { finality: "finalized" } };
    const result = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(body);
      },
    });
    expect(seen[0]!.url).toBe("https://beaconcha.in/api/v2/ethereum/queues");
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(await seen[0]!.clone().text()).toBe(JSON.stringify({ chain: "mainnet" }));
    expect(result).toMatchObject({ connector: "beaconchain", action: "healthcheck", source: "provider", data: body });
  });

  test("V1 epoch lookup sends apikey query and encodes the path", async () => {
    const seen: Request[] = [];
    await actions["epoch.get"]!({
      apiKey: "secret",
      epoch: "latest",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "OK", data: { epoch: 1 } });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/api/v1/epoch/latest");
    expect(url.searchParams.get("apikey")).toBe("secret");
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer secret");
  });

  test("omits optional V1 query parameters", async () => {
    const seen: Request[] = [];
    await actions["validators.balance_history"]!({
      apiKey: "secret",
      index_or_pubkey: "1",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "OK", data: [] });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/api/v1/validator/1/balancehistory");
    expect(url.searchParams.get("apikey")).toBe("secret");
    expect(url.searchParams.has("limit")).toBe(false);
    expect(url.searchParams.has("offset")).toBe(false);
    expect(url.searchParams.has("latest_epoch")).toBe(false);
  });

  test("proposal luck uses the validators query parameter", async () => {
    const seen: Request[] = [];
    await actions["validators.proposal_luck"]!({
      apiKey: "secret",
      validators: "1,2",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "OK", data: { proposal_luck: 1 } });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/api/v1/validators/proposalLuck");
    expect(url.searchParams.get("validators")).toBe("1,2");
  });

  test("rejects missing required input before network", async () => {
    let called = false;
    await expect(
      actions["slot.get"]!({
        apiKey: "secret",
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  test("maps throttling without exposing credentials", async () => {
    await expect(
      actions.healthcheck!({
        apiKey: "secret",
        fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "7" }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });

  test("maps HTTP 401 to upstream error", async () => {
    await expect(
      actions["state.latest"]!({
        apiKey: "secret",
        fetch: async () => response({ status: "ERROR: unauthorized" }, 401),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
