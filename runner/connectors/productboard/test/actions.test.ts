import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import list from "../fixtures/list.json";
import created from "../fixtures/created.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) =>
  new Response(body === "" ? "" : JSON.stringify(body), { status });

describe("productboard HTTP contract", () => {
  test("healthcheck uses bearer auth and accepts empty input", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({
      accessToken: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(list);
      },
    });
    expect(seen[0].url).toBe("https://api.productboard.com/v2/members");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ members: list.data, source: "provider" });
  });

  test("encodes IDs and does not follow provider links", async () => {
    const seen: Request[] = [];
    await actions["entities.get"]!({
      accessToken: "secret",
      id: "a/b",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ data: list.data[0] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v2/entities/a%2Fb");
    expect(seen).toHaveLength(1);
  });

  test("maps rate limits and malformed output safely", async () => {
    await expect(
      actions["notes.list"]!({ accessToken: "secret", fetch: async () => response({ message: "slow" }, 429) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
    await expect(
      actions["notes.list"]!({ accessToken: "secret", fetch: async () => response({ data: {} }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("creates notes and entities with a data wrapper", async () => {
    const seen: Request[] = [];
    const note = await actions["notes.create"]!({
      accessToken: "secret",
      type: "textNote",
      name: "Feedback",
      content: "Need search",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(created, 201);
      },
    });
    expect(seen[0].url).toBe("https://api.productboard.com/v2/notes");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await seen[0].clone().text())).toEqual({
      data: { type: "textNote", fields: { name: "Feedback", content: "Need search" } },
    });
    expect(note).toMatchObject({ note: created.data, source: "provider" });

    await expect(
      actions["entities.delete"]!({
        accessToken: "secret",
        id: "pb_1",
        fetch: async () => response("", 204),
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  test("lists teams, relationships, and configurations", async () => {
    const teams = await actions["teams.list"]!({
      accessToken: "secret",
      fetch: async () => response(list),
    });
    expect(teams).toMatchObject({ teams: list.data, source: "provider" });
    await actions["notes.relationships.list"]!({
      accessToken: "secret",
      id: "n1",
      fetch: async () => response(list),
    });
    await actions["entities.configurations.list"]!({
      accessToken: "secret",
      fetch: async () => response(list),
    });
  });

  test("rejects missing create fields", async () => {
    await expect(actions["notes.create"]!({ accessToken: "secret", type: "textNote" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});
