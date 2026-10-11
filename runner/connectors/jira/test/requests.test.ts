import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { renderPath } from "../../../bun/src/declarative/template";
import { healthcheck } from "../src/healthcheck";
import { executeIssuesSearchSync, executeProjectsListSync, executeUsersListSync } from "../src/sync";

type Exchange = {
  operation: string;
  kind: string;
  input?: Record<string, unknown>;
  request: { method?: string; body: string | null };
  response: { status: number; body: unknown };
};

const exchangeDir = join(import.meta.dir, "../fixtures/exchanges");
const exchanges = readdirSync(exchangeDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(exchangeDir, name), "utf8")) as Exchange);

function capturingFetch(status: number, body: unknown, captured: { req?: Request }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured.req = new Request(input, init);
    const payload = body === undefined ? "" : JSON.stringify(body);
    return Promise.resolve(new Response(payload, { status, headers: { "content-type": "application/json" } }));
  };
}

describe("jira request depth", () => {
  const ops = manifest.operations as Record<string, Record<string, unknown>>;

  it("gives every non-healthcheck action a real request and keeps budgets", () => {
    expect(manifest.http.baseUrl).toBe("https://api.atlassian.com");
    expect(manifest.http.baseUrl.includes("{{")).toBe(false);
    let requests = 0;
    for (const [key, op] of Object.entries(ops)) {
      expect(op.maxResponseBytes as number).toBeGreaterThanOrEqual(op.maxInputBytes as number);
      if (op.kind === "webhook") {
        expect(op.sideEffect).toBe("read");
        expect(op.request).toBeUndefined();
        continue;
      }
      if (op.kind === "action" && key !== "healthcheck") {
        const request = op.request as { method: string; path: string; body?: unknown; headers?: Record<string, string> };
        expect(typeof request.method).toBe("string");
        expect(request.path.startsWith("/ex/jira/{{cloudId}}/")).toBe(true);
        expect(request.path.includes("{{cloudId}}")).toBe(true);
        const headers = request.headers ?? {};
        const contentType = headers["Content-Type"] ?? headers["content-type"];
        if (request.method === "GET" || request.method === "DELETE") {
          expect(request.body).toBeUndefined();
          expect(contentType).toBeUndefined();
        } else if (request.body !== undefined) {
          expect(contentType).toBe("application/json");
        } else {
          expect(contentType).toBeUndefined();
        }
        requests += 1;
      }
    }
    expect(requests).toBeGreaterThanOrEqual(103);
  });

  it("has one success fixture per non-webhook operation", () => {
    const nonWebhook = Object.entries(ops)
      .filter(([, op]) => op.kind !== "webhook")
      .map(([key]) => key)
      .sort();
    expect(exchanges.map((item) => item.operation).sort()).toEqual(nonWebhook);
    for (const item of exchanges) {
      const body = item.request.body;
      if (body !== null) {
        expect(typeof body).toBe("string");
        expect(body).toBe(JSON.stringify(JSON.parse(body)));
      }
    }
  });

  const compiled = compileDeclarativeConnector(manifest as never);
  for (const item of exchanges.filter((entry) => entry.kind === "action")) {
    it(`${item.operation} performs ${item.request.method}`, async () => {
      const captured: { req?: Request } = {};
      const input = {
        ...(item.input ?? {}),
        accessToken: "tok",
        cloudId: "cid",
        fetch: capturingFetch(200, { ok: true }, captured),
      };
      const operation = (manifest.operations as Record<string, { request: { method: string; path: string } }>)[item.operation];
      const result = await compiled.actions[item.operation]!(input) as Record<string, unknown>;
      expect(result.action).toBe(item.operation);
      expect(result.source).toBe("provider");
      expect(captured.req).toBeDefined();
      expect(captured.req!.method).toBe(item.request.method);
      expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
      expect(new URL(captured.req!.url).pathname).toBe(renderPath(operation.request.path, input));
      expect(captured.req!.url.startsWith("https://api.atlassian.com/ex/jira/cid/")).toBe(true);
      const text = await captured.req!.text();
      if (item.request.body === null) {
        expect(text).toBe("");
        expect(captured.req!.headers.get("content-type")).toBeNull();
      } else {
        expect(text).toBe(item.request.body);
        expect(captured.req!.headers.get("content-type")).toBe("application/json");
      }
    });
  }

  it("healthcheck fixture succeeds without a request body", () => {
    const item = exchanges.find((entry) => entry.operation === "healthcheck")!;
    expect(item.request.body).toBeNull();
    expect(healthcheck()).toEqual({ connector: "jira", status: "ok", source: "connector" });
  });

  it("sync fixtures parse into items", () => {
    const issues = exchanges.find((entry) => entry.operation === "issues.search")!;
    const projects = exchanges.find((entry) => entry.operation === "projects.list")!;
    const users = exchanges.find((entry) => entry.operation === "users.list")!;
    expect(issues.request.body).toBeNull();
    expect(executeIssuesSearchSync({ response: issues.response.body }).items).toHaveLength(1);
    expect(executeProjectsListSync({ response: projects.response.body }).items).toHaveLength(1);
    expect(executeUsersListSync({ response: users.response.body }).items).toHaveLength(1);
  });
});
