import { expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import cases from "../fixtures/contracts.json";
import errors from "../fixtures/errors.json";
const credentials = { accessToken: "test-secret", instagramUserId: "17841400000000001" };
async function load() {
  const file = Bun.file(new URL("../manifest.json", import.meta.url));
  expect(await file.exists()).toBe(true);
  const manifest = await file.json();
  return { manifest, ...compileDeclarativeConnector(manifest) };
}
for (const c of cases) {
  it(`${c.op} calls only the documented endpoint and maps its contract`, async () => {
    const { actions, manifest } = await load();
    const calls: { url: string; init?: RequestInit }[] = [];
    const output = await actions[c.op]!({ ...c.input, ...credentials,
      fetch: async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json(c.response);
      },
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(`https://graph.instagram.com/v26.0${c.path}`);
    expect(Object.fromEntries(url.searchParams)).toEqual(c.query);
    expect(calls[0]!.init?.method).toBe(c.method);
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-secret");
    expect(headers.get("Content-Type")).toBe("application/json");
    const body = calls[0]!.init?.body;
    expect(body ? JSON.parse(String(body)) : null).toEqual(c.body);
    expect(output).toEqual({ connector: "instagram-standalone", action: c.op, source: "provider", ...c.output });
    expect(JSON.stringify(output)).not.toContain("do-not-return");
    expect(JSON.stringify(output)).not.toContain("test-secret");
    const op = manifest.operations[c.op];
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe(c.method === "GET" ? "read" : "write");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.description.length).toBeGreaterThan(10);
    const echo = await actions[c.op]!({ ...c.input });
    expect(echo).toMatchObject(c.op === "healthcheck" ? { status: "ok" } : { validated: c.input });
  });
}
it("declares complete manual token contracts and bound account ID", async () => {
  const { manifest, actions } = await load();
  expect(Object.keys(actions).sort()).toEqual(cases.map(c => c.op).sort());
  expect(manifest.auth.type).toBe("oauth2");
  expect(manifest.auth.setup.mode).toBe("api_key");
  expect(manifest.auth.oauth).toBeUndefined();
  expect(manifest.auth.scopes).toEqual(["instagram_business_basic", "instagram_business_content_publish"]);
  expect(manifest.auth.setup.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: "accessToken", secret: true, required: true }),
    expect.objectContaining({ key: "instagramUserId", secret: false, required: true }),
  ]));
  expect(manifest.network.allowedHosts).toEqual(["graph.instagram.com"]);
});
it("rejects missing required action inputs before network", async () => {
  const { actions } = await load();
  for (const op of ["media.get", "containers.createImage", "containers.createReel", "containers.get", "media.publish"]) {
    let calls = 0;
    await expect(actions[op]!({ ...credentials, fetch: async () => { calls++; return Response.json({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
  }
});
it("preserves provider errors including HTTP-success error envelopes", async () => {
  const { actions } = await load();
  for (const status of [200, 400, 403]) {
    await expect(actions.healthcheck!({ ...credentials, fetch: async () => Response.json(errors.expired, { status }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  }
});
it("classifies Graph business-use-case throttling and HTTP 429", async () => {
  const { actions } = await load();
  await expect(actions.healthcheck!({ ...credentials, fetch: async () => Response.json(errors.throttled, { status: 400 }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  await expect(actions.healthcheck!({ ...credentials, fetch: async () => Response.json({}, { status: 429, headers: { "retry-after": "25" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 });
});
it("returns empty final media page without fabricated cursors or credential-bearing URLs", async () => {
  const { actions } = await load();
  const output = await actions["media.list"]!({ ...credentials, fetch: async (url: unknown) => {
    expect(new URL(String(url)).searchParams.has("after")).toBe(false);
    return Response.json({ data: [] });
  }});
  expect(output).toEqual({ connector: "instagram-standalone", action: "media.list", source: "provider", media: [] });
});
it("creates only a container and leaves publishing to an explicit separate call", async () => {
  const { actions } = await load();
  let calls = 0;
  const output = await actions["containers.createReel"]!({ ...credentials, videoUrl: "https://cdn.example.com/reel.mp4", fetch: async (_: unknown, init?: RequestInit) => {
    calls++;
    expect(JSON.parse(String(init?.body))).toEqual({ media_type: "REELS", video_url: "https://cdn.example.com/reel.mp4" });
    return Response.json({ id: "18000000000000001" });
  }});
  expect(calls).toBe(1);
  expect(output).toMatchObject({ containerId: "18000000000000001" });
  expect(output).not.toHaveProperty("mediaId");
});
it("read-only QA rejects fixture echoes, empty and missing provider identities", async () => {
  const { actions } = await load();
  const qa = await Bun.file(new URL("../qa.json", import.meta.url)).json();
  expect(qa.connector).toBe("instagram-standalone");
  expect(qa.scenarios).toHaveLength(1);
  const probe = qa.scenarios[0];
  expect(probe.operation).toBe("healthcheck");
  expect(probe.input).toEqual({});
  expect(probe.setup ?? []).toEqual([]);
  expect(probe.teardown ?? []).toEqual([]);
  expect(probe.expect).toEqual({ status: "ok", assertions: [
    { path: "source", op: "eq", value: "provider" },
    { path: "userId", op: "type", value: "string" },
    { path: "userId", op: "matches", value: "\\S" },
  ] });
  function passes(output: Record<string, unknown>) {
    return probe.expect.assertions.every((a: {path:string;op:string;value:string}) => {
      const value = output[a.path];
      if (a.op === "eq") return value === a.value;
      if (a.op === "type") return typeof value === a.value;
      if (a.op === "matches") return typeof value === "string" && new RegExp(a.value).test(value);
      throw new Error("unexpected assertion");
    });
  }
  expect(passes(await actions.healthcheck!({}) as Record<string, unknown>)).toBe(false);
  for (const response of [{}, { id: "" }, { id: " " }, { id: 123 }]) {
    const output = await actions.healthcheck!({ ...credentials, fetch: async () => Response.json(response) });
    expect(passes(output as Record<string, unknown>)).toBe(false);
  }
  const valid = await actions.healthcheck!({ ...credentials, fetch: async () => Response.json(cases[0]!.response) });
  expect(passes(valid as Record<string, unknown>)).toBe(true);
});
