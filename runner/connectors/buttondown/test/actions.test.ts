import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import account from "../fixtures/account.json";

const { actions } = compileDeclarativeConnector(manifest);
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("buttondown declarative reads", () => {
  test("authenticates healthcheck and preserves one request", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ apiKey: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return reply(account); } });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("authorization")).toBe("Token secret");
    expect(new URL(seen[0].url).pathname).toBe("/v1/accounts/me");
    expect(result).toMatchObject({ account, source: "provider" });
  });

  test("escapes subscriber identifiers and maps rate limits", async () => {
    const seen: Request[] = [];
    await actions["subscribers.get"]!({ apiKey: "k", id_or_email: "a/b@example.com", fetch: async (input, init) => { seen.push(new Request(input, init)); return reply({ id: "s" }); } });
    expect(new URL(seen[0].url).pathname).toBe("/v1/subscribers/a%2Fb%40example.com");
    await expect(actions["account.get"]!({ apiKey: "k", fetch: async () => reply({ message: "slow" }, 429) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
