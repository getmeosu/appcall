import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("contactout HTTP contract", () => {
  test("sends token plus authorization basic on healthcheck", async () => {
    const seen: Request[] = [];
    const out = await actions.healthcheck!({
      apiKey: "fixture-api-token",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status_code: 200, usage: {} });
      },
    });
    expect(seen[0]!.method).toBe("GET");
    expect(seen[0]!.url).toBe("https://api.contactout.com/v1/stats");
    expect(seen[0]!.headers.get("token")).toBe("fixture-api-token");
    expect(seen[0]!.headers.get("authorization")).toBe("basic");
    expect(out).toMatchObject({ source: "provider" });
  });

  test("searches people with JSON body", async () => {
    const seen: Request[] = [];
    await actions["people.search"]!({
      apiKey: "fixture-api-token",
      name: "Example Person",
      page: 1,
      pageSize: 25,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status_code: 200, profiles: {} });
      },
    });
    expect(seen[0]!.url).toBe("https://api.contactout.com/v1/people/search");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(await seen[0]!.json()).toEqual({ name: "Example Person", page: 1, page_size: 25 });
  });

  test("rejects invalid input and maps 429", async () => {
    await expect(
      actions["linkedin.enrich"]!({
        apiKey: "fixture-api-token",
        profile: "",
        fetch: async () => response({}),
      }),
    ).rejects.toBeDefined();
    await expect(
      actions["stats.get"]!({
        apiKey: "fixture-api-token",
        fetch: async () => response({ message: "slow" }, 429),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
