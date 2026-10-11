import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest as never);
const cred = { apiKey: "token" };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("breezy-hr depth", () => {
  test("keeps the connector key and bumps to 0.2.0 with 16 HTTP actions", () => {
    expect(manifest.key).toBe("breezy-hr");
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations);
    expect(ops.filter(([, spec]) => spec.kind === "action")).toHaveLength(16);
    expect(ops.filter(([, spec]) => spec.kind === "webhook")).toEqual([]);
    expect(ops.every(([, spec]) => spec.kind === "webhook" || Boolean(spec.request))).toBe(true);
    expect(actions["webhook.candidate_added"]).toBeUndefined();
    expect(Object.keys(actions).sort()).toEqual(
      ops.filter(([, spec]) => spec.kind === "action").map(([key]) => key).sort(),
    );
  });

  test("sends the raw API token and nested company/position/candidate paths", async () => {
    let seen: Request | undefined;
    const result = await actions["candidates.get"]!({
      ...cred,
      companyId: "c1",
      positionId: "p1",
      candidateId: "cand1",
      fetch: async (url: string, init?: RequestInit) => {
        seen = new Request(url, init);
        return response({ _id: "cand1", name: "Ada Lovelace" });
      },
    });
    expect(seen?.url).toBe("https://api.breezy.hr/v3/company/c1/position/p1/candidate/cand1");
    expect(seen?.headers.get("authorization")).toBe("token");
    expect(seen?.headers.get("accept")).toBe("application/json");
    expect(result).toMatchObject({ connector: "breezy-hr", action: "candidates.get", source: "provider" });
  });

  test("searches candidates by email and creates a position with JSON body", async () => {
    let search: Request | undefined;
    await actions["candidates.search"]!({
      ...cred,
      companyId: "c1",
      emailAddress: "ada@example.com",
      fetch: async (url: string, init?: RequestInit) => {
        search = new Request(url, init);
        return response([{ _id: "cand1" }]);
      },
    });
    expect(search?.url).toContain("/company/c1/candidates/search");
    expect(new URL(search!.url).searchParams.get("email_address")).toBe("ada@example.com");

    let created: Request | undefined;
    const result = await actions["positions.create"]!({
      ...cred,
      companyId: "c1",
      name: "Staff Engineer",
      type: "fullTime",
      description: "Build the hiring pipeline.",
      country: "US",
      fetch: async (url: string, init?: RequestInit) => {
        created = new Request(url, init);
        return response({ _id: "p1" }, 201);
      },
    });
    expect(created?.method).toBe("POST");
    expect(created?.headers.get("content-type")).toBe("application/json");
    expect(await created!.clone().json()).toEqual({
      name: "Staff Engineer",
      type: "fullTime",
      description: "Build the hiring pipeline.",
      location: { country: "US" },
    });
    expect(result).toMatchObject({ data: { _id: "p1" } });
  });

  test("rejects missing nested IDs before fetch and maps 429", async () => {
    let called = false;
    await expect(
      actions["positions.get"]!({ ...cred, fetch: async () => { called = true; return response({}); } }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
    await expect(
      actions["companies.list"]!({
        ...cred,
        fetch: async () => response({ message: "slow" }, 429, { "retry-after": "17" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });
});
