import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";
import { WORKABLE_ACTION_KEYS, createWorkableActionHandlers, executeWorkableAction } from "../src/actions";
import actionFixture from "../fixtures/action_success.json";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  }) as typeof fetch;
  return { calls, impl };
}

const auth = { account: "acme", accessToken: "test-token" };

describe("Workable action operations", () => {
  test("registers every new manifest action with a handwritten handler", () => {
    expect(Object.keys(createWorkableActionHandlers()).sort()).toEqual([...WORKABLE_ACTION_KEYS].sort());
    expect(WORKABLE_ACTION_KEYS).toContain("employees.documents.upload");
    expect(WORKABLE_ACTION_KEYS).toContain("subscriptions.delete");
    expect(WORKABLE_ACTION_KEYS).toContain("background_checks.update");
  });

  test("gets an employee from the authenticated account SPI", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ employee: { id: "emp-1", firstname: "Ada" } }));

    const result = await executeWorkableAction("employees.get", {
      ...auth,
      employeeId: "emp-1",
      fetch: impl,
    });

    expect(new URL(calls[0].url).hostname).toBe("acme.workable.com");
    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/employees/emp-1");
    expect(calls[0].headers.get("authorization")).toBe("Bearer test-token");
    expect(result).toEqual({ employee: { id: "emp-1", firstname: "Ada" } });
  });

  test("creates a department with the provider's documented body shape", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture), { status: 201 });

    await executeWorkableAction("departments.create", {
      ...auth,
      name: "Research",
      parentId: "d-1",
      fetch: impl,
    });

    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/departments");
    expect(calls[0].method).toBe("POST");
    expect(await calls[0].json()).toEqual({ name: "Research", parent_id: "d-1" });
  });

  test("invites members using the provider's direct body fields", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture), { status: 201 });

    await executeWorkableAction("members.invite", {
      ...auth,
      member: { email: "ada@example.com", roles: ["ats.simple"] },
      fetch: impl,
    });

    expect(calls[0].method).toBe("POST");
    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/members/invite");
    expect(await calls[0].json()).toEqual({ email: "ada@example.com", roles: ["ats.simple"] });
  });

  test("sends employee document uploads in the documented request shape", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture), { status: 201 });
    const documents = [{ url: "https://cdn.example.test/id.pdf", name: "ID" }];

    await executeWorkableAction("employees.documents.upload", {
      ...auth,
      employeeId: "emp-2",
      documents,
      memberId: "member-1",
      fetch: impl,
    });

    expect(calls[0].method).toBe("POST");
    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/employees/emp-2/documents");
    expect(await calls[0].json()).toEqual({ member_id: "member-1", documents });
  });

  test("deletes a subscription by a safely encoded path identifier", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture));

    await executeWorkableAction("subscriptions.delete", {
      ...auth,
      subscriptionId: "sub_123",
      fetch: impl,
    });

    expect(calls[0].method).toBe("DELETE");
    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/subscriptions/sub_123");
  });

  test("rejects unsafe identifiers before issuing an outbound request", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(executeWorkableAction("employees.get", {
      ...auth,
      employeeId: "../other-account",
      fetch: impl,
    })).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });

  test("classifies rate limits and preserves retry timing", async () => {
    const { impl } = stubFetch('{"error":"slow down"}', { status: 429, headers: { "retry-after": "17" } });

    await expect(executeWorkableAction("departments.list", {
      ...auth,
      fetch: impl,
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });

  test("healthcheck calls SPI stages when a token is present", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ stages: [{ slug: "sourced", name: "Sourced", kind: "sourced", position: 0 }] }));

    const result = await healthcheck({ ...auth, fetch: impl });

    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/stages");
    expect(result).toEqual({ status: "ok", source: "provider" });
  });

  test("healthcheck stays local when no token is present", async () => {
    const result = await healthcheck({});
    expect(result).toEqual({ status: "ok", source: "connector" });
  });

  test("lists accounts on the documented apex SPI host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture));

    await executeWorkableAction("accounts.list", { ...auth, fetch: impl });

    expect(new URL(calls[0].url).hostname).toBe("workable.com");
    expect(new URL(calls[0].url).pathname).toBe("/spi/v3/accounts");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("content-type")).toBeNull();
  });

  test("lists jobs with the documented SPI filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture));

    await executeWorkableAction("jobs.list", {
      ...auth,
      state: "published",
      limit: "10",
      includeFields: "description",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("acme.workable.com");
    expect(url.pathname).toBe("/spi/v3/jobs");
    expect(url.searchParams.get("state")).toBe("published");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("include_fields")).toBe("description");
    expect(calls[0].headers.get("content-type")).toBeNull();
  });

  test("uses the public Workable host for published jobs", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture));

    await executeWorkableAction("public_jobs.list", {
      ...auth,
      subdomain: "acme",
      fetch: impl,
    });

    expect(new URL(calls[0].url).hostname).toBe("www.workable.com");
    expect(new URL(calls[0].url).pathname).toBe("/api/accounts/acme");
    expect(calls[0].method).toBe("GET");
  });

  test("updates a background check on the partner callback host, not SPI", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(actionFixture));
    const check = {
      overall_status: "consider",
      result: [{ name: "motor_vehicle_report", status: "clear" }],
    };
    const attachments = [
      { description: "Background Check Report", url: "https://acme.example/report.pdf" },
    ];

    const result = await executeWorkableAction("background_checks.update", {
      ...auth,
      backgroundCheckId: "8823119",
      status: "completed",
      resultsUrl: "https://acme.example/checks/8823119",
      check,
      attachments,
      fetch: impl,
    });

    expect(new URL(calls[0].url).hostname).toBe("acme.workable.com");
    expect(new URL(calls[0].url).pathname).toBe("/checks/8823119");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].headers.get("authorization")).toBe("Bearer test-token");
    expect(await calls[0].json()).toEqual({
      status: "completed",
      results_url: "https://acme.example/checks/8823119",
      check,
      attachments,
    });
    expect(result).toEqual(actionFixture);
  });

  test("rejects completed background check updates that omit results_url", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(executeWorkableAction("background_checks.update", {
      ...auth,
      backgroundCheckId: "8823119",
      status: "completed",
      fetch: impl,
    })).rejects.toThrow("resultsUrl");

    expect(calls).toHaveLength(0);
  });

  test("rejects unsafe background check identifiers before issuing an outbound request", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(executeWorkableAction("background_checks.update", {
      ...auth,
      backgroundCheckId: "../other-account",
      status: "declined",
      fetch: impl,
    })).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });
});
