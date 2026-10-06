import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest as never);
const cred = { apiKey: "fixture-key" };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("clickmeeting depth", () => {
  test("keeps the connector key and bumps to 0.2.0 with 20 HTTP actions", () => {
    expect(manifest.key).toBe("clickmeeting");
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations);
    expect(ops.filter(([, spec]) => spec.kind === "action")).toHaveLength(20);
    expect(ops.filter(([, spec]) => spec.kind === "webhook")).toHaveLength(0);
    expect(Object.keys(actions).sort()).toEqual(
      ops.filter(([, spec]) => spec.kind === "action").map(([key]) => key).sort(),
    );
  });

  test("creates a conference with form-encoded fields", async () => {
    let seen: Request | undefined;
    const result = await actions["conferences.create"]!({
      ...cred,
      name: "My meeting",
      room_type: "meeting",
      permanent_room: 0,
      access_type: 1,
      fetch: async (url: string, init?: RequestInit) => {
        seen = new Request(url, init);
        return response({ room: { id: 2686 } });
      },
    });
    expect(seen?.method).toBe("POST");
    expect(seen?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(seen?.headers.get("x-api-key")).toBe("fixture-key");
    expect(await seen!.clone().text()).toBe("name=My+meeting&room_type=meeting&permanent_room=0&access_type=1");
    expect(result).toMatchObject({ data: { room: { id: 2686 } } });
  });

  test("rejects missing room id before fetch", async () => {
    let called = false;
    await expect(
      actions["conferences.get"]!({
        ...cred,
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
