import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const compiled = compileDeclarativeConnector(
  manifest as unknown as Parameters<typeof compileDeclarativeConnector>[0],
);

type Scenario = {
  operation: string;
  input: Record<string, unknown>;
  method: string;
  path: string;
  query?: Record<string, string | string[]>;
  body: Record<string, unknown> | null;
  fixture: string;
  sideEffect: "read" | "write";
  expect: "data" | "people_search" | "healthcheck";
};

const scenarios = JSON.parse(
  readFileSync(new URL("../fixtures/depth_scenarios.json", import.meta.url), "utf8"),
) as Scenario[];

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

describe("Apollo declarative HTTP requests", () => {
  test("every action has a request method and path", () => {
    const ops = manifest.operations as Record<string, {
      kind?: string;
      sideEffect?: string;
      request?: { method?: string; path?: string };
    }>;
    expect(Object.keys(ops)).toHaveLength(68);
    let actions = 0;
    for (const [key, operation] of Object.entries(ops)) {
      if (operation.kind === "webhook") {
        expect(key).toBe("webhook.phone_revealed");
        expect(operation.sideEffect).toBe("read");
        expect(operation.request).toBeUndefined();
        continue;
      }
      actions += 1;
      expect(operation.request?.method).toEqual(expect.any(String));
      expect(operation.request?.path?.startsWith("/api/v1/")).toBe(true);
      expect(["read", "write"]).toContain(operation.sideEffect);
    }
    expect(actions).toBe(67);
    expect(scenarios).toHaveLength(29);
  });

  for (const scenario of scenarios) {
    test(`${scenario.operation} sends its documented request and returns the provider fixture`, async () => {
      const ops = manifest.operations as Record<string, { sideEffect?: string }>;
      expect(ops[scenario.operation].sideEffect).toBe(scenario.sideEffect);
      const response = loadFixture(scenario.fixture);
      let captured: Request | undefined;
      const result = await compiled.actions[scenario.operation]({
        ...scenario.input,
        apiKey: "test_apollo_key",
        fetch: async (input, init) => {
          captured = new Request(input, init);
          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      });
      expect(captured).toBeDefined();
      const url = new URL(captured!.url);
      expect(captured!.method).toBe(scenario.method);
      expect(url.origin).toBe("https://api.apollo.io");
      expect(url.pathname).toBe(scenario.path);
      expect(captured!.headers.get("x-api-key")).toBe("test_apollo_key");
      const actualQuery = [...url.searchParams.keys()];
      const expectedQuery = scenario.query ?? {};
      expect([...new Set(actualQuery)].sort()).toEqual(Object.keys(expectedQuery).sort());
      for (const [key, expected] of Object.entries(expectedQuery)) {
        expect(url.searchParams.getAll(key)).toEqual(Array.isArray(expected) ? expected : [expected]);
      }
      if (scenario.body === null) expect(await captured!.text()).toBe("");
      else expect(await captured!.json()).toEqual(scenario.body);
      if (scenario.expect === "people_search") {
        expect(result.data).toEqual(response);
        expect(result.total_entries).toBe(1);
      } else if (scenario.expect === "healthcheck") {
        expect(result.status).toBe("ok");
        expect(result.data).toEqual(response);
      } else {
        expect(result.data).toEqual(response);
      }
      expect(result.connector).toBe("apollo");
      expect(result.action).toBe(scenario.operation);
      expect(result.source).toBe("provider");
    });
  }

  test("healthcheck without a credential echoes status ok and does not call Apollo", async () => {
    let requests = 0;
    const result = await compiled.actions["healthcheck"]({
      fetch: async () => {
        requests += 1;
        return new Response("{}", { status: 200 });
      },
    });
    expect(requests).toBe(0);
    expect(result).toEqual({
      connector: "apollo",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  test("bulk organization enrich sends domains in the query and an empty details object when details is omitted", async () => {
    let captured: Request | undefined;
    await compiled.actions["organizations.bulk_enrich"]({
      domains: ["apollo.io"],
      apiKey: "test_apollo_key",
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(JSON.stringify({ organizations: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const url = new URL(captured!.url);
    expect(url.pathname).toBe("/api/v1/organizations/bulk_enrich");
    expect(url.searchParams.getAll("domains[]")).toEqual(["apollo.io"]);
    expect(await captured!.json()).toEqual({});
  });

  test("rejects an undeclared field before a provider call", async () => {
    let requests = 0;
    await expect(compiled.actions["email_accounts.list"]({
      unexpected: true,
      apiKey: "test_apollo_key",
      fetch: async () => {
        requests += 1;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(requests).toBe(0);
  });

  test("path identifiers reject traversal tokens before a provider call", async () => {
    let requests = 0;
    await expect(compiled.actions["accounts.update"]({
      id: "..",
      name: "Acme",
      apiKey: "test_apollo_key",
      fetch: async () => {
        requests += 1;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(requests).toBe(0);
  });

  test("add contacts rejects an unsupported status before a provider call", async () => {
    let requests = 0;
    await expect(compiled.actions["sequences.add_contacts"]({
      emailer_campaign_id: "seq_001",
      contact_ids: ["con_001"],
      send_email_from_email_account_id: "ea_001",
      status: "running",
      apiKey: "test_apollo_key",
      fetch: async () => {
        requests += 1;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(requests).toBe(0);
  });

  test("people search rejects non-string title entries before a provider call", async () => {
    let requests = 0;
    await expect(compiled.actions["people.search"]({
      person_titles: [1],
      apiKey: "test_apollo_key",
      fetch: async () => {
        requests += 1;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(requests).toBe(0);
  });
});
