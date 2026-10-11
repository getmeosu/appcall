import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("salesflare HTTP contract", () => {
  test("uses bearer auth, encodes page, and wraps the provider JSON under data", async () => {
    const seen: Request[] = [];
    const payload = { data: [{ id: 101, name: "Ada Lovelace" }], meta: { nextPage: 2 } };
    const result = await actions["contacts.list"]!({
      apiKey: "secret",
      page: 2,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(payload);
      },
    });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(new URL(seen[0].url).searchParams.get("page")).toBe("2");
    expect(result).toMatchObject({
      connector: "salesflare",
      action: "contacts.list",
      source: "provider",
      data: payload,
    });
    expect(seen).toHaveLength(1);
  });

  test("maps unauthorized responses", async () => {
    await expect(
      actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
