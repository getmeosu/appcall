import { describe, expect, test } from "bun:test";
import {
  G3_OPERATION_KEYS,
  G3_SPECS,
  createGreenhouseG3ActionHandlers,
  executeGreenhouseG3Action,
} from "../src/g3";
import { clearGreenhouseTokenCache } from "../src/http";
import manifest from "../manifest.json";
import listFixture from "../fixtures/g3_list.json";
import createdFixture from "../fixtures/g3_created.json";
import bulkFixture from "../fixtures/g3_bulk.json";
import userFixture from "../fixtures/g3_user.json";

const auth = { clientId: "fixture-client", clientSecret: "fixture-secret" };

function isToken(url: string) {
  return String(url).includes("auth.greenhouse.io/token");
}
function isIntrospect(url: string) {
  return String(url).includes("auth.greenhouse.io/introspect");
}
function harvestCalls(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls.filter((c) => c.url.includes("harvest.greenhouse.io"));
}

function stub(body: string, status = 200, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (isToken(String(url))) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (isIntrospect(String(url))) {
      return Promise.resolve(
        new Response(JSON.stringify({ active: true, sub: "1049756", username: "u@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(body, { status, headers: { "content-type": "application/json", ...headers } }),
    );
  };
  return { calls, impl };
}

function sampleInput(spec: (typeof G3_SPECS)[string]): Record<string, unknown> {
  const input: Record<string, unknown> = { ...auth };
  for (const name of spec.required) {
    if (name === "data") input.data = [{ id: 1, name: "row" }];
    else if (name === "fields") input.fields = ["full_name"];
    else if (name === "sequential") input.sequential = true;
    else if (name === "approver_groups") input.approver_groups = [{ approvals_required: 1, approver_ids: [1] }];
    else if (name === "interviewers") input.interviewers = [{ user_id: 1, response_status: "accepted" }];
    else if (name.endsWith("_ids") || name.endsWith("s") && name !== "fields") {
      // leave arrays to explicit cases
      input[name] = name.endsWith("_id") || !name.endsWith("s") ? 9 : [9];
    } else if (name.endsWith("_id") || name === "id" || name.endsWith("Id")) input[name] = 11;
    else if (name === "email" || name === "primary_email") input[name] = "user@example.com";
    else if (name === "value") input[name] = "192.0.2.1";
    else if (name === "source_type") input[name] = "ip_address";
    else if (name === "approval_type") input[name] = "open_job";
    else if (name === "field_type") input[name] = "job";
    else if (name === "value_type") input[name] = "short_text";
    else if (name === "type" && spec.slug.includes("OWNER")) input[name] = "recruiter";
    else if (name === "type") input[name] = "resume";
    else if (name === "filename") input[name] = "resume.pdf";
    else if (name === "body") input[name] = "hello";
    else if (name === "name" || name === "first_name" || name === "last_name" || name === "job_name") {
      input[name] = "Ada";
    } else if (name === "number_of_openings" || name === "sort_order" || name === "template_job_id") {
      input[name] = 2;
    } else input[name] = "x";
  }
  return input;
}

describe("Greenhouse G3 Composio coverage", () => {
  test("registers 88 handwritten handlers matching the manifest", () => {
    const handlers = createGreenhouseG3ActionHandlers();
    expect(G3_OPERATION_KEYS).toHaveLength(88);
    expect(Object.keys(handlers).sort()).toEqual([...G3_OPERATION_KEYS].sort());
    for (const key of G3_OPERATION_KEYS) {
      expect(manifest.operations[key as keyof typeof manifest.operations]).toBeTruthy();
      const op = manifest.operations[key as keyof typeof manifest.operations] as {
        kind: string;
        title: string;
        description: string;
        inputSchema: { type: string };
        request?: unknown;
      };
      expect(op.kind).toBe("action");
      expect(op.title.length).toBeGreaterThan(0);
      expect(op.description).toContain("/v3");
      expect(op.inputSchema.type).toBe("object");
      expect(op.request).toBeUndefined();
    }
  });

  test("every G3 spec issues the documented Harvest v3 method and path", async () => {
    for (const key of G3_OPERATION_KEYS) {
      if (key === "users.me") continue;
      clearGreenhouseTokenCache();
      const spec = G3_SPECS[key]!;
      const body = spec.method === "GET" ? JSON.stringify(listFixture) : JSON.stringify(createdFixture);
      const status = spec.emptyOk ? 204 : spec.method === "POST" ? 201 : 200;
      const { calls, impl } = stub(spec.emptyOk ? "" : body, spec.emptyOk ? 204 : status);
      const result = await executeGreenhouseG3Action(key, { ...sampleInput(spec), fetch: impl } as any);
      const harvest = harvestCalls(calls);
      expect(harvest.length).toBeGreaterThan(0);
      const url = new URL(harvest[0]!.url);
      const expected = spec.path.replace(/\{[a-z0-9_]+\}/g, "11");
      expect(url.pathname).toBe(`/v3${expected}`);
      expect(String(harvest[0]!.init?.method ?? "GET").toUpperCase()).toBe(spec.method);
      if (spec.method === "GET" && spec.listKey) {
        expect((result as any)[spec.listKey].length).toBeGreaterThan(0);
      }
    }
  });

  test("users.me introspects the token then GETs /v3/users?ids=", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify([userFixture]));
    const result = (await executeGreenhouseG3Action("users.me", { ...auth, fetch: impl } as any)) as any;
    const introspect = calls.find((c) => isIntrospect(c.url));
    expect(introspect).toBeTruthy();
    expect(String(introspect!.init?.method ?? "POST").toUpperCase()).toBe("POST");
    const harvest = harvestCalls(calls)[0]!;
    const url = new URL(harvest.url);
    expect(url.pathname).toBe("/v3/users");
    expect(url.searchParams.get("ids")).toBe("1049756");
    expect(result.user.id).toBe(1049756);
    expect(result.introspect.sub).toBe("1049756");
  });

  test("creates send snake_case JSON and optional On-Behalf-Of", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(createdFixture), 201);
    await executeGreenhouseG3Action("departments.create", {
      ...auth,
      name: "Engineering",
      parent_id: 3,
      on_behalf_of: "99",
      fetch: impl,
    } as any);
    const call = harvestCalls(calls)[0]!;
    expect(new URL(call.url).pathname).toBe("/v3/departments");
    expect(JSON.parse(String(call.init?.body))).toEqual({ name: "Engineering", parent_id: 3 });
    const headers = call.init?.headers as Record<string, string>;
    expect(headers["On-Behalf-Of"]).toBe("99");
  });

  test("bulk create posts data + callback_url to /bulk", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(bulkFixture), 201);
    const result = (await executeGreenhouseG3Action("openings.bulk_create", {
      ...auth,
      data: [{ job_id: 1 }],
      callback_url: "https://example.test/hook",
      fetch: impl,
    } as any)) as any;
    const call = harvestCalls(calls)[0]!;
    expect(call.init?.method).toBe("POST");
    expect(new URL(call.url).pathname).toBe("/v3/openings/bulk");
    expect(JSON.parse(String(call.init?.body))).toEqual({
      data: [{ job_id: 1 }],
      callback_url: "https://example.test/hook",
    });
    expect(result.bulk_action_uuid).toBe("bulk-1");
  });

  test("bulk delete custom field options sends DELETE with JSON body", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(bulkFixture), 200);
    await executeGreenhouseG3Action("custom_field_options.bulk_delete", {
      ...auth,
      data: [1, 2, 3],
      fetch: impl,
    } as any);
    const call = harvestCalls(calls)[0]!;
    expect(call.init?.method).toBe("DELETE");
    expect(new URL(call.url).pathname).toBe("/v3/custom_field_options/bulk");
    expect(JSON.parse(String(call.init?.body))).toEqual({ data: [1, 2, 3] });
  });

  test("replace approver PUTs add/remove user ids", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(createdFixture));
    await executeGreenhouseG3Action("approver_groups.replace_approver", {
      ...auth,
      id: "44",
      add_user_id: 8,
      remove_user_id: 7,
      fetch: impl,
    } as any);
    const call = harvestCalls(calls)[0]!;
    expect(call.init?.method).toBe("PUT");
    expect(new URL(call.url).pathname).toBe("/v3/approver_groups/44/replace_approver");
    expect(JSON.parse(String(call.init?.body))).toEqual({ add_user_id: 8, remove_user_id: 7 });
  });

  test("anonymize PATCHes /candidates/{id}/anonymize", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify({ id: 5 }), 200);
    await executeGreenhouseG3Action("candidates.anonymize", {
      ...auth,
      id: 5,
      fields: ["full_name", "email_addresses"],
      fetch: impl,
    } as any);
    const call = harvestCalls(calls)[0]!;
    expect(call.init?.method).toBe("PATCH");
    expect(new URL(call.url).pathname).toBe("/v3/candidates/5/anonymize");
    expect(JSON.parse(String(call.init?.body))).toEqual({ fields: ["full_name", "email_addresses"] });
  });

  test("applications.search GETs /v3/applications with search query", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(listFixture));
    const result = (await executeGreenhouseG3Action("applications.search", {
      ...auth,
      search: "Ada",
      job_ids: [10, 11],
      stage_status: "in_process",
      fetch: impl,
    } as any)) as any;
    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.pathname).toBe("/v3/applications");
    expect(url.searchParams.get("search")).toBe("Ada");
    expect(url.searchParams.get("job_ids")).toBe("10,11");
    expect(url.searchParams.get("stage_status")).toBe("in_process");
    expect(result.applications).toHaveLength(1);
  });

  test("activate/deactivate/revoke hit user member routes and treat 204 as ok", async () => {
    for (const [key, path] of [
      ["users.activate", "/v3/users/11/activate"],
      ["users.deactivate", "/v3/users/11/deactivate"],
      ["users.revoke_permissions", "/v3/users/11/revoke_permissions"],
    ] as const) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stub("", 204);
      const result = await executeGreenhouseG3Action(key, { ...auth, id: "11", fetch: impl } as any);
      expect(result).toEqual({ ok: true });
      expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe(path);
      expect(harvestCalls(calls)[0]!.init?.method).toBe("POST");
    }
  });

  test("rejects unsafe path ids before network", async () => {
    await expect(
      executeGreenhouseG3Action("jobs.update", {
        ...auth,
        id: "../evil",
        name: "x",
        fetch: async () => {
          throw new Error("network must not be called");
        },
      } as any),
    ).rejects.toThrow();
  });

  test("upstream 404 becomes CONNECTOR_UPSTREAM_ERROR", async () => {
    clearGreenhouseTokenCache();
    const { impl } = stub(JSON.stringify({ errors: [{ message: "Not Found" }] }), 404);
    let caught: any;
    try {
      await executeGreenhouseG3Action("job_notes.delete", { ...auth, id: "9", fetch: impl } as any);
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("camelCase aliases map onto Harvest snake_case query/body", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(listFixture));
    await executeGreenhouseG3Action("openings.list", {
      ...auth,
      jobIds: [5],
      perPage: 2,
      fetch: impl,
    } as any);
    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.searchParams.get("job_ids")).toBe("5");
    expect(url.searchParams.get("per_page")).toBe("2");
  });
});
