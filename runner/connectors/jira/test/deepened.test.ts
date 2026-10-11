import { describe, expect, it } from "bun:test";
import { DEPTH_SPECS, jiraDepthActions, runDepth, buildDepthRequest } from "../src/depth";
import { getIssue, addComment, createIssueLink } from "../src/actions";
import { parseWebhook } from "../src/webhook";
import manifest from "../manifest.json";

function capturingFetch(status: number, body: unknown, captured: { req?: Request }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captured.req = new Request(input, init);
    const payload = body === null || body === undefined ? null : (typeof body === "string" ? body : JSON.stringify(body));
    return Promise.resolve(new Response(payload, { status, headers: { "content-type": "application/json" } }));
  };
}

describe("jira depth coverage", () => {
  it("has 87 new composio-backed operations", () => {
    expect(DEPTH_SPECS).toHaveLength(87);
    expect(Object.keys(jiraDepthActions)).toHaveLength(87);
  });

  it("every depth spec is in the manifest with title and object inputSchema", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const spec of DEPTH_SPECS) {
      const op = ops[spec.id];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(typeof op.title).toBe("string");
      expect(typeof op.description).toBe("string");
      const schema = op.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
    }
  });

  it("every webhook has sideEffect read", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    const webhooks = Object.entries(ops).filter(([, op]) => op.kind === "webhook");
    expect(webhooks.length).toBe(17);
    for (const [, op] of webhooks) {
      expect(op.sideEffect).toBe("read");
      expect(typeof op.title).toBe("string");
    }
  });
});

describe("jira depth HTTP", () => {
  for (const spec of DEPTH_SPECS) {
    it(`${spec.id} ${spec.method} ${spec.expectPath}`, async () => {
      const captured: { req?: Request } = {};
      const handler = jiraDepthActions[spec.id];
      const result = await handler({
        ...spec.sample,
        accessToken: "tok",
        cloudId: "cid",
        fetch: capturingFetch(200, { ok: true, id: spec.id }, captured),
      }) as Record<string, unknown>;
      expect(result.action).toBe(spec.id);
      expect(result.connector).toBe("jira");
      expect(captured.req).toBeDefined();
      expect(captured.req!.method).toBe(spec.method);
      expect(captured.req!.headers.get("Authorization")).toBe("Bearer tok");
      expect(captured.req!.url).toContain(spec.expectPath);
      const family = spec.family ?? "api3";
      if (family === "agile") expect(captured.req!.url).toContain("/rest/agile/1.0/");
      else if (family === "servicedesk") expect(captured.req!.url).toContain("/rest/servicedeskapi/");
      else expect(captured.req!.url).toContain("/rest/api/3/");
    });
  }

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(runDepth(DEPTH_SPECS[0], {
      ...DEPTH_SPECS[0].sample,
      accessToken: "tok",
      cloudId: "cid",
      fetch: capturingFetch(429, {}, { req: undefined } as { req?: Request }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  it("throws on missing required input", () => {
    const spec = DEPTH_SPECS.find((item) => (item.required?.length ?? 0) > 0)!;
    expect(() => runDepth(spec, {})).toThrow();
  });
});

describe("composio aliases on existing handlers", () => {
  it("getIssue accepts issue_id_or_key", () => {
    const result = getIssue({ issue_id_or_key: "PROJ-9" }) as Record<string, unknown>;
    expect((result.validated as Record<string, unknown>).issueKey).toBe("PROJ-9");
  });

  it("addComment accepts comment + issue_id_or_key", () => {
    const result = addComment({ issue_id_or_key: "PROJ-9", comment: "hi" }) as Record<string, unknown>;
    expect((result.validated as Record<string, unknown>).issueKey).toBe("PROJ-9");
    expect((result.validated as Record<string, unknown>).body).toBe("hi");
  });

  it("createIssueLink accepts link_type aliases", () => {
    const result = createIssueLink({
      inward_issue_key: "PROJ-1",
      outward_issue_key: "PROJ-2",
      link_type: "Blocks",
    }) as Record<string, unknown>;
    expect((result.validated as Record<string, unknown>).type).toBe("Blocks");
  });
});

describe("search issues JQL builder", () => {
  it("builds bounded JQL from structured filters", () => {
    const spec = DEPTH_SPECS.find((item) => item.id === "issues.search.action")!;
    const built = buildDepthRequest(spec, { project_key: "PROJ", status_id_or_name: "Done", labels: ["api"] });
    expect(built.method).toBe("POST");
    expect(built.path).toBe("/search/jql");
    const body = built.body as Record<string, unknown>;
    expect(String(body.jql)).toContain('project = "PROJ"');
    expect(String(body.jql)).toContain('status = "Done"');
    expect(String(body.jql)).toContain('labels = "api"');
  });
});

describe("jira webhooks", () => {
  it("classifies issue created", () => {
    const parsed = parseWebhook({ webhookEvent: "jira:issue_created", issue: { key: "PROJ-1", id: "10001" }, timestamp: 1 });
    expect(parsed.operation).toBe("webhook.jira.issue_created");
    expect(parsed.idempotencyKey).toContain("PROJ-1");
  });

  it("classifies sprint closed", () => {
    const parsed = parseWebhook({ webhookEvent: "sprint_closed", sprint: { id: 31 }, timestamp: 2 });
    expect(parsed.operation).toBe("webhook.sprint_closed");
  });

  it("classifies version released", () => {
    const parsed = parseWebhook({ webhookEvent: "jira:version_released", version: { id: "55" }, timestamp: 3 });
    expect(parsed.operation).toBe("webhook.version_released");
  });
});
