import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userFixture from "../fixtures/responses/user.json";
import incidentGetFixture from "../fixtures/responses/incident-get.json";
import incidentsListFixture from "../fixtures/responses/incidents-list.json";
import servicesListFixture from "../fixtures/responses/services-list.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mock(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function auth(calls: Call[]): string {
  return (calls[0]!.init?.headers as Record<string, string>).Authorization ?? "";
}

function header(calls: Call[], name: string): string {
  return (calls[0]!.init?.headers as Record<string, string>)[name] ?? "";
}

describe("pagerduty connector surface", () => {
  it("compiles one handler per declared action", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends Token token= with the personal user token", async () => {
    const { calls, fetchFn } = mock(userFixture);
    await actions.healthcheck!({ apiKey: "u+TEST", fetch: fetchFn });
    expect(auth(calls)).toBe("Token token=u+TEST");
    expect(header(calls, "Accept")).toBe("application/vnd.pagerduty+json;version=2");
  });
});

describe("healthcheck", () => {
  it("reports connector-owned status without a credential", () => {
    const result = actions.healthcheck!({}) as Record<string, unknown>;
    expect(result.connector).toBe("pagerduty");
    expect(result.action).toBe("healthcheck");
    expect(result.source).toBe("connector");
  });

  it("calls GET /users/me", async () => {
    const { calls, fetchFn } = mock(userFixture);
    const result = await actions.healthcheck!({ apiKey: "token", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/users/me");
    expect(result.source).toBe("provider");
    expect(result.data).toEqual(userFixture);
  });
});

describe("users", () => {
  it("users.get fetches one user by ID", async () => {
    const { calls, fetchFn } = mock(userFixture);
    const result = await actions["users.get"]!({ apiKey: "token", id: "P123", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/users/P123");
    expect(result.data).toEqual(userFixture);
  });

  it("users.get requires id", () => {
    expect(() => actions["users.get"]!({})).toThrow("id is required");
  });

  it("users.list pages through users", async () => {
    const { calls, fetchFn } = mock({ users: [userFixture.user], limit: 25, offset: 0, more: false });
    const result = await actions["users.list"]!({ apiKey: "token", limit: 25, query: "Ada", fetch: fetchFn }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/users");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("query")).toBe("Ada");
    expect((result.data as { users: unknown[] }).users).toHaveLength(1);
  });
});

describe("incidents", () => {
  it("incidents.list filters by status and service", async () => {
    const { calls, fetchFn } = mock(incidentsListFixture);
    await actions["incidents.list"]!({
      apiKey: "token",
      limit: 25,
      statuses: ["triggered", "acknowledged"],
      serviceIds: ["PIJ90N7"],
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/incidents");
    expect(url.searchParams.getAll("statuses[]")).toEqual(["triggered", "acknowledged"]);
    expect(url.searchParams.getAll("service_ids[]")).toEqual(["PIJ90N7"]);
  });

  it("incidents.get fetches one incident", async () => {
    const { calls, fetchFn } = mock(incidentGetFixture);
    const result = await actions["incidents.get"]!({ apiKey: "token", id: "PT4KHLK", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/incidents/PT4KHLK");
    expect((result.data as { incident: { id: string } }).incident.id).toBe("PT4KHLK");
  });

  it("incidents.create posts the incident envelope with the From header", async () => {
    const { calls, fetchFn } = mock(incidentGetFixture, 201);
    await actions["incidents.create"]!({
      apiKey: "token",
      fromEmail: "ada@example.com",
      title: "API latency",
      serviceId: "PIJ90N7",
      urgency: "high",
      details: "p99 > 2s",
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/incidents");
    expect(header(calls, "From")).toBe("ada@example.com");
    expect(header(calls, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      incident: {
        type: "incident",
        title: "API latency",
        service: { id: "PIJ90N7", type: "service_reference" },
        urgency: "high",
        body: { type: "incident_body", details: "p99 > 2s" },
      },
    });
  });

  it("incidents.create requires fromEmail, title, and serviceId", () => {
    expect(() => actions["incidents.create"]!({ title: "x", serviceId: "PIJ90N7" })).toThrow("fromEmail is required");
    expect(() => actions["incidents.create"]!({ fromEmail: "ada@example.com", serviceId: "PIJ90N7" })).toThrow("title is required");
    expect(() => actions["incidents.create"]!({ fromEmail: "ada@example.com", title: "x" })).toThrow("serviceId is required");
  });

  it("incidents.update PUTs supplied fields", async () => {
    const { calls, fetchFn } = mock(incidentGetFixture);
    await actions["incidents.update"]!({
      apiKey: "token",
      id: "PT4KHLK",
      fromEmail: "ada@example.com",
      title: "API latency [SEV2]",
      urgency: "low",
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/incidents/PT4KHLK");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      incident: { type: "incident", title: "API latency [SEV2]", urgency: "low" },
    });
  });

  it("incidents.resolve sets status resolved", async () => {
    const { calls, fetchFn } = mock(incidentGetFixture);
    await actions["incidents.resolve"]!({
      apiKey: "token",
      id: "PT4KHLK",
      fromEmail: "ada@example.com",
      resolution: "rolled back",
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      incident: { type: "incident", status: "resolved", resolution: "rolled back" },
    });
  });

  it("incidents.acknowledge sets status acknowledged", async () => {
    const { calls, fetchFn } = mock(incidentGetFixture);
    await actions["incidents.acknowledge"]!({
      apiKey: "token",
      id: "PT4KHLK",
      fromEmail: "ada@example.com",
      fetch: fetchFn,
    });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      incident: { type: "incident", status: "acknowledged" },
    });
  });
});

describe("services", () => {
  it("services.list pages through services", async () => {
    const { calls, fetchFn } = mock(servicesListFixture);
    const result = await actions["services.list"]!({ apiKey: "token", query: "Checkout", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).pathname).toBe("/services");
    expect((result.data as { services: unknown[] }).services).toHaveLength(1);
  });

  it("services.get fetches one service", async () => {
    const { calls, fetchFn } = mock({ service: servicesListFixture.services[0] });
    const result = await actions["services.get"]!({ apiKey: "token", id: "PIJ90N7", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/services/PIJ90N7");
    expect((result.data as { service: { id: string } }).service.id).toBe("PIJ90N7");
  });

  it("services.create posts the service envelope", async () => {
    const { calls, fetchFn } = mock({ service: servicesListFixture.services[0] }, 201);
    await actions["services.create"]!({
      apiKey: "token",
      name: "Checkout",
      escalationPolicyId: "PWIXJ6C",
      description: "Checkout API",
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.pagerduty.com/services");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      service: {
        type: "service",
        name: "Checkout",
        description: "Checkout API",
        escalation_policy: { id: "PWIXJ6C", type: "escalation_policy_reference" },
      },
    });
  });
});

describe("schedules, on-calls, policies, and log entries", () => {
  it("schedules.list reads /schedules", async () => {
    const { calls, fetchFn } = mock({ schedules: [{ id: "PI7DH85", name: "Primary" }] });
    await actions["schedules.list"]!({ apiKey: "token", query: "Primary", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/schedules");
    expect(url.searchParams.get("query")).toBe("Primary");
  });

  it("oncalls.list reads /oncalls", async () => {
    const { calls, fetchFn } = mock({ oncalls: [{ user: { id: "P123" }, schedule: { id: "PI7DH85" } }] });
    await actions["oncalls.list"]!({ apiKey: "token", userIds: ["P123"], fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/oncalls");
    expect(url.searchParams.getAll("user_ids[]")).toEqual(["P123"]);
  });

  it("escalation_policies.list reads /escalation_policies", async () => {
    const { calls, fetchFn } = mock({ escalation_policies: [{ id: "PWIXJ6C", name: "Engineering" }] });
    await actions["escalation_policies.list"]!({ apiKey: "token", query: "Engineering", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/escalation_policies");
  });

  it("log_entries.list reads /log_entries", async () => {
    const { calls, fetchFn } = mock({ log_entries: [{ id: "Q0K12P8N5Z7KLM", type: "trigger_log_entry" }] });
    await actions["log_entries.list"]!({
      apiKey: "token",
      since: "2026-10-01T00:00:00Z",
      until: "2026-10-02T00:00:00Z",
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/log_entries");
    expect(url.searchParams.get("since")).toBe("2026-10-01T00:00:00Z");
    expect(url.searchParams.get("until")).toBe("2026-10-02T00:00:00Z");
  });
});

describe("outbound boundary", () => {
  it("only allows api.pagerduty.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.pagerduty.com"]);
  });
});
