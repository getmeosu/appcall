import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const res = (b: unknown, s = 200, h?: HeadersInit) => new Response(JSON.stringify(b), { status: s, headers: h });

describe("everhour origin contract", () => {
  test("sends X-Api-Key on origin operations", async () => {
    for (const name of ["healthcheck", "users.list", "projects.list", "projects.get", "time.list"] as const) {
      const input: Record<string, unknown> = {
        apiKey: "secret",
        fetch: async (i: RequestInfo | URL, x?: RequestInit) => {
          expect(new Request(i, x).headers.get("x-api-key")).toBe("secret");
          expect(new Request(i, x).headers.get("accept")).toBe("application/json");
          return res(name === "healthcheck" || name === "projects.get" ? { id: 1 } : []);
        },
      };
      if (name === "projects.get") input.projectId = "ev:1";
      await actions[name]!(input);
    }
  });

  test("healthcheck is GET /users/me", async () => {
    const seen: Request[] = [];
    const user = { id: 101, name: "Ada Lovelace", role: "admin", status: "active" };
    const result = await actions.healthcheck!({
      apiKey: "token",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res(user);
      },
    });
    expect(seen[0]!.url).toBe("https://api.everhour.com/users/me");
    expect(result).toMatchObject({ connector: "everhour", action: "healthcheck", source: "provider", data: user });
  });

  test("projects.get percent-encodes colon-bearing integration ids", async () => {
    const seen: Request[] = [];
    await actions["projects.get"]!({
      apiKey: "token",
      projectId: "as:123456",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ id: "as:123456", name: "Website" });
      },
    });
    expect(seen[0]!.url).toBe("https://api.everhour.com/projects/as%3A123456");
  });

  test("rejects extra fields and missing projectId", async () => {
    await expect(actions["projects.list"]!({ apiKey: "token", unknownField: "nope", fetch: async () => res([]) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["projects.get"]!({ apiKey: "token", fetch: async () => res({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("maps 401 and 429", async () => {
    await expect(actions.healthcheck!({ apiKey: "bad", fetch: async () => res({ message: "Invalid API key" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({ apiKey: "token", fetch: async () => res({ message: "slow" }, 429, { "retry-after": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});

describe("everhour write tools", () => {
  test("clients.create posts name and omits unset optionals", async () => {
    const seen: Request[] = [];
    await actions["clients.create"]!({
      apiKey: "token",
      name: "Acme",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ id: 1001, name: "Acme" }, 201);
      },
    });
    expect(seen[0]!.url).toBe("https://api.everhour.com/clients");
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await seen[0]!.text())).toEqual({ name: "Acme" });
  });

  test("timers.start posts the Composio task id", async () => {
    const seen: Request[] = [];
    await actions["timers.start"]!({
      apiKey: "token",
      task: "ev:192144450634449",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ status: "active" }, 201);
      },
    });
    expect(seen[0]!.url).toBe("https://api.everhour.com/timers");
    expect(JSON.parse(await seen[0]!.text())).toEqual({ task: "ev:192144450634449" });
  });

  test("timecards.clockIn posts to the user timecard path", async () => {
    const seen: Request[] = [];
    await actions["timecards.clockIn"]!({
      apiKey: "token",
      user_id: 14856,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ user: 14856, clockIn: "09:00" });
      },
    });
    expect(seen[0]!.url).toBe("https://api.everhour.com/users/14856/timecards/clock-in");
    expect(seen[0]!.method).toBe("POST");
  });

  test("webhooks.create posts events and targetUrl", async () => {
    const seen: Request[] = [];
    await actions["webhooks.create"]!({
      apiKey: "token",
      events: ["api:timer:started", "api:task:created"],
      targetUrl: "https://example.test/everhour-hook",
      project: "ev:1",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ id: 42 }, 201);
      },
    });
    expect(JSON.parse(await seen[0]!.text())).toEqual({
      events: ["api:timer:started", "api:task:created"],
      project: "ev:1",
      targetUrl: "https://example.test/everhour-hook",
    });
  });

  test("tasks.create posts under the project", async () => {
    const seen: Request[] = [];
    await actions["tasks.create"]!({
      apiKey: "token",
      name: "Write unit tests",
      projectId: "ev:192144450634449",
      estimate: 3600,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ id: "ev:9", name: "Write unit tests" }, 201);
      },
    });
    expect(seen[0]!.url).toBe("https://api.everhour.com/projects/ev%3A192144450634449/tasks");
    expect(JSON.parse(await seen[0]!.text())).toEqual({ name: "Write unit tests", estimate: 3600 });
  });
});
