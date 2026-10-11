import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const mock = (body: unknown, status = 200) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
    calls.push({ url: String(u), init: i });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetch };
};

describe("bugsnag declarative connector", () => {
  it("compiles every declared action including origin/main reads", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(actions).length).toBe(62);
    expect(actions.healthcheck).toBeDefined();
    expect(actions["projects.create"]).toBeDefined();
    expect(actions["errors.bulk-update"]).toBeDefined();
    expect(actions["integrations.test"]).toBeDefined();
  });

  it("healthchecks with token auth", async () => {
    const m = mock({ id: "u1", email: "qa@example.test" });
    const r = await actions.healthcheck!({ apiKey: "secret", fetch: m.fetch });
    expect(m.calls[0]?.url).toBe("https://api.bugsnag.com/user");
    expect((m.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("token secret");
    expect(r).toMatchObject({ connector: "bugsnag", action: "healthcheck", source: "provider" });
  });

  it("creates a project with json body and encodes organization id", async () => {
    const m = mock({ id: "p1", name: "Demo" }, 201);
    const r = await actions["projects.create"]!({
      apiKey: "x",
      organization_id: "org/a",
      name: "Demo",
      type: "rails",
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://api.bugsnag.com/organizations/org%2Fa/projects");
    expect(m.calls[0]?.init?.method).toBe("POST");
    expect(String(m.calls[0]?.init?.body)).toBe('{"name":"Demo","type":"rails"}');
    expect(r).toMatchObject({ connector: "bugsnag", action: "projects.create", data: { id: "p1", name: "Demo" } });
  });

  it("bulk-updates errors via query ids and json operation", async () => {
    const m = mock({ operation: "fix" });
    await actions["errors.bulk-update"]!({
      apiKey: "x",
      project_id: "p1",
      error_ids: ["e1", "e2"],
      operation: "fix",
      fetch: m.fetch,
    });
    const url = new URL(m.calls[0]?.url ?? "");
    expect(url.pathname).toBe("/projects/p1/errors");
    expect(url.searchParams.getAll("error_ids")).toEqual(["e1", "e2"]);
    expect(String(m.calls[0]?.init?.body)).toBe('{"operation":"fix"}');
  });

  it("rejects missing required path input", async () => {
    await expect(actions["organizations.get"]!({ apiKey: "x", fetch: async () => new Response("{}") })).rejects.toMatchObject({
      ok: false,
      code: "INVALID_ACTION_INPUT",
    });
  });
});
