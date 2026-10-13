import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const creds = { apiKey: "fixture-token", apiKeyId: "fixture-id" };

function res(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("amplitude HTTP first-slice actions", () => {
  test("healthcheck and user search keep Dashboard REST basic auth", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return res({ data: [] });
    };
    await actions.healthcheck!({ ...creds, fetch });
    await actions["users.search"]!({ ...creds, user: "user-123", fetch });
    expect(new URL(seen[0]!.url).pathname).toBe("/api/2/events/list");
    expect(seen[0]!.method).toBe("GET");
    expect(await seen[0]!.text()).toBe("");
    expect(seen[0]!.headers.get("content-type")).toBeNull();
    expect(seen[0]!.headers.get("authorization")).toBe(`Basic ${btoa("fixture-id:fixture-token")}`);
    expect(new URL(seen[1]!.url).pathname).toBe("/api/2/usersearch");
    expect(new URL(seen[1]!.url).searchParams.get("user")).toBe("user-123");
  });

  test("users.identify form-encodes identification onto api2.amplitude.com", async () => {
    const seen: Request[] = [];
    const identification = '[{"user_id":"u1","user_properties":{"plan":"pro"}}]';
    const result = await actions["users.identify"]!({
      ...creds,
      identification,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return res({ code: 200 });
      },
    });
    expect(new URL(seen[0]!.url).hostname).toBe("api2.amplitude.com");
    expect(new URL(seen[0]!.url).pathname).toBe("/identify");
    expect(seen[0]!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await seen[0]!.text()).toBe(
      `api_key=fixture-id&identification=${encodeURIComponent(identification)}`,
    );
    expect(result).toMatchObject({ connector: "amplitude", action: "users.identify", source: "provider" });
  });

  test("events.send posts JSON HTTP V2 events onto /2/httpapi", async () => {
    const seen: Request[] = [];
    const events = [{ user_id: "user_1", event_type: "signup" }];
    await actions["events.send"]!({
      ...creds,
      events,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return res({ code: 200, events_ingested: 1 });
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).hostname).toBe("api2.amplitude.com");
    expect(new URL(seen[0]!.url).pathname).toBe("/2/httpapi");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await seen[0]!.text())).toEqual({ api_key: "fixture-id", events });
  });

  test("events.batch posts the same JSON shape onto /batch", async () => {
    const seen: Request[] = [];
    const events = [{ user_id: "user_1", event_type: "signup" }];
    await actions["events.batch"]!({
      ...creds,
      events,
      options: { min_id_length: 1 },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return res({ code: 200 });
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/batch");
    expect(JSON.parse(await seen[0]!.text())).toEqual({
      api_key: "fixture-id",
      events,
      options: { min_id_length: 1 },
    });
  });

  test("annotations.delete is a body-less DELETE", async () => {
    const seen: Request[] = [];
    await actions["annotations.delete"]!({
      ...creds,
      id: 1,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return res({ success: true });
      },
    });
    expect(seen[0]!.method).toBe("DELETE");
    expect(new URL(seen[0]!.url).pathname).toBe("/api/2/annotations");
    expect(new URL(seen[0]!.url).searchParams.get("id")).toBe("1");
    expect(await seen[0]!.text()).toBe("");
    expect(seen[0]!.headers.get("content-type")).toBeNull();
  });

  test("rejects extra fields on a strict origin op", async () => {
    await expect(
      actions["users.search"]!({ ...creds, user: "u", unexpectedField: true }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("EventOnly webhooks do not compile to handlers", () => {
    expect(actions["webhook.event"]).toBeUndefined();
    expect(actions["webhook.cohort"]).toBeUndefined();
  });

  test("depth fixtures replay the documented HTTP calls", async () => {
    const dir = new URL("../fixtures/cases/", import.meta.url);
    const names = [
      "annotationCategories.assign-success.json",
      "cohorts.download-success.json",
      "cohorts.request-success.json",
      "deletions.cancel-success.json",
      "deletions.create-success.json",
      "groups.identify-success.json",
      "taxonomy.categories.create-success.json",
      "taxonomy.events.restore-success.json",
      "usermap.create-success.json",
      "users.active-success.json",
    ];
    for (const name of names) {
      const fixture = await Bun.file(new URL(name, dir)).json();
      const seen: Request[] = [];
      await actions[fixture.operation]!({
        ...fixture.credentials,
        ...fixture.input,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          seen.push(new Request(input, init));
          return res({ success: true });
        },
      });
      const expected = fixture.exchanges[0].request;
      expect(seen[0]!.method, name).toBe(expected.method);
      expect(seen[0]!.url, name).toBe(expected.url);
      const body = await seen[0]!.text();
      expect(body, name).toBe(expected.body ?? "");
      if (expected.method === "GET" || expected.method === "DELETE") {
        expect(seen[0]!.headers.get("content-type"), name).toBeNull();
      }
    }
  });

  test("chart annotation v3 fixtures replay the documented calls", async () => {
    const dir = new URL("../fixtures/cases/", import.meta.url);
    const names = [
      "annotations.v3.list-success.json",
      "annotations.v3.create-success.json",
      "annotations.v3.delete-success.json",
    ];
    for (const name of names) {
      const caseUrl = new URL(name, dir);
      const fixture = await Bun.file(caseUrl).json();
      const exchange = fixture.exchanges[0];
      const responseBody = await Bun.file(new URL(exchange.response.bodyFile, caseUrl)).json();
      const expected = await Bun.file(new URL(fixture.expected.resultFile, caseUrl)).json();
      let captured: { url: string; method: string; body: string | null; headers: Record<string, string> } | undefined;
      const result = await actions[fixture.operation]!({
        ...fixture.credentials,
        ...fixture.input,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          captured = {
            url: String(input),
            method: String(init?.method ?? "GET"),
            body: init?.body == null ? null : String(init.body),
            headers: (init?.headers ?? {}) as Record<string, string>,
          };
          return res(responseBody, exchange.response.status);
        },
      });
      expect(captured?.method, name).toBe(exchange.request.method);
      expect(captured?.url, name).toBe(exchange.request.url);
      expect(captured?.body, name).toBe(exchange.request.body);
      expect(result, name).toEqual(expected);
      const headerNames = Object.keys(captured?.headers ?? {}).sort();
      if (exchange.request.method === "POST") {
        expect(headerNames, name).toEqual(["Accept", "Authorization", "Content-Type"]);
        expect(captured?.headers["Content-Type"], name).toBe("application/json");
      } else {
        expect(headerNames, name).toEqual(["Accept", "Authorization"]);
        expect(captured?.headers["Content-Type"], name).toBeUndefined();
      }
    }
  });

  test("chart annotation v3 rejects an empty id and a create without start", async () => {
    await expect(actions["annotations.v3.delete"]!({ ...creds, annotationId: "" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["annotations.v3.create"]!({ ...creds, label: "Feature X Release" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});
