import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
const { actions } = compileDeclarativeConnector(manifest as never);
for (const c of cases) describe(c.op, () => {
  it("validates without credentials", async () => {
    const r = await actions[c.op]!({...c.input, unexpected:"ignored"});
    expect(r).toMatchObject(c.op === "healthcheck" ? {status:"ok"} : {validated:c.input});
    expect(JSON.stringify(r)).not.toContain("ignored");
  });
  it("sends the documented URL, method, authentication and body", async () => {
    let count = 0;
    const r = await actions[c.op]!({...c.input, accessToken:"test-secret", fetch:async (url:unknown, init?:RequestInit) => {
      count++;
      expect(String(url)).toBe(manifest.http.baseUrl + c.path);
      expect(init?.method).toBe(c.method);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-secret");
      expect(headers.get("Content-Type")).toBe("application/json");
      if(manifest.key === "tumblr") expect(headers.get("User-Agent")).toBe("appcall/0.1.0");
      expect(init?.body ? JSON.parse(String(init.body)) : null).toEqual(c.body);
      return new Response(c.response === null ? null : JSON.stringify(c.response), {status:c.status, headers:c.headers});
    }});
    expect(count).toBe(1);
    expect(r).toMatchObject(c.output);
  });
  it("surfaces upstream failures", async () => {
    await expect(actions[c.op]!({...c.input,accessToken:"test-secret",fetch:async()=>new Response(JSON.stringify({message:"Forbidden",meta:{msg:"Forbidden"}}),{status:403})})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR",message:expect.stringContaining("Forbidden")});
  });
});
it("uses the provider rate reset semantics", async () => {
  const headers = manifest.key === "dribbble" ? {"x-ratelimit-reset":String(Math.floor(Date.now()/1000)+30)} : {"retry-after":"30"};
  try {await actions["users.me"]!({accessToken:"test-secret",fetch:async()=>new Response("{}",{status:429,headers})});throw new Error("unexpected success");}
  catch(e) {expect(e).toMatchObject({code:"CONNECTOR_RATE_LIMITED"});const delay=(e as {retryAfterSeconds:number}).retryAfterSeconds;expect(delay).toBeGreaterThanOrEqual(28);expect(delay).toBeLessThanOrEqual(30);}
});
it("rejects missing identifiers before any request", async () => {
  const op = manifest.key === "tumblr" ? "posts.get" : "shots.get";
  let called = false;
  try {await actions[op]!({accessToken:"test-secret",fetch:async()=>{called=true;return new Response("{}");}});throw new Error("unexpected success");}
  catch(e) {expect(e).toMatchObject({code:"INVALID_ACTION_INPUT"});}
  expect(called).toBe(false);
});
it("omits optional pagination values and preserves an empty page", async () => {
  const result = await actions["following.list"]!({accessToken:"test-secret",fetch:async(url:unknown)=>{
    expect(String(url)).toBe("https://api.tumblr.com/v2/user/following");
    return new Response(JSON.stringify({meta:{status:200},response:{blogs:[],total_blogs:0}}));
  }});
  expect(result).toMatchObject({blogs:[],totalBlogs:0});
});
it("rejects missing or unsupported post state", async () => {
  for(const state of [undefined,"surprise"]) {
    let called = false;
    try {await actions["posts.createText"]!({blog:"writer",text:"Hello",state,accessToken:"test-secret",fetch:async()=>{called=true;return new Response("{}");}});throw new Error("unexpected success");}
    catch(e) {expect(e).toMatchObject({code:"INVALID_ACTION_INPUT"});}
    expect(called).toBe(false);
  }
});
it("surfaces a populated errors envelope even on HTTP 200", async () => {
  await expect(actions["users.me"]!({accessToken:"test-secret",fetch:async()=>new Response(JSON.stringify({errors:[{title:"Invalid user token"}]}))})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
});

// Endpoint-specific checks intentionally do not use fixtures/contracts.json.
// Tumblr /docs/api: NPF GET /posts/{post-id} uses post_format; legacy lists use npf.
it("uses the NPF single-post endpoint and its documented format parameter", async () => {
  const result = await actions["posts.get"]!({
    blog: "writer.tumblr.com",
    postId: "9007199254740993",
    accessToken: "test-secret",
    fetch: async (url: unknown) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe("/v2/blog/writer.tumblr.com/posts/9007199254740993");
      expect([...parsed.searchParams]).toEqual([["post_format", "npf"]]);
      return new Response('{"meta":{"status":200},"response":{"id":"9007199254740993","type":"blocks","content":[]}}');
    },
  });
  expect(result).toMatchObject({ post: { id: "9007199254740993", type: "blocks" } });
});

// The NPF creation section explicitly defines request state "queue" and string id.
it("queues NPF text and preserves a string ID above Number.MAX_SAFE_INTEGER", async () => {
  const result = await actions["posts.createText"]!({
    blog: "writer.tumblr.com",
    text: "Queue this text",
    state: "queue",
    accessToken: "test-secret",
    fetch: async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.tumblr.com/v2/blog/writer.tumblr.com/posts");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        content: [{ type: "text", text: "Queue this text" }],
        state: "queue",
      });
      return new Response('{"meta":{"status":201,"msg":"Created"},"response":{"id":"9007199254740993"}}', { status: 201 });
    },
  });
  expect(result).toMatchObject({ id: "9007199254740993" });
  expect(typeof (result as { id: unknown }).id).toBe("string");
});
