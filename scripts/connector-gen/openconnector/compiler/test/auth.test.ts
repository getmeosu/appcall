import { describe, expect, test } from "bun:test";
import { extractProviderAuth } from "../auth";

const source = (auth: string, base = "https://api.example.test/v1") => `const cfg={baseUrl:${JSON.stringify(base)},auth:${auth}}; defineProviderProxy(service,cfg);`;

describe("static provider auth extraction", () => {
  test("extracts header and query API key descriptors", () => {
    expect(extractProviderAuth("x.ts", source('{type:"api_key",in:"header",name:"X-Key",field:"apiKey"}')).auth.in).toBe("header");
    expect(extractProviderAuth("x.ts", source('{type:"api_key",in:"query",name:"key",field:"apiKey"}')).auth.in).toBe("query");
  });
  test("extracts Basic Authorization descriptors", () => {
    const out = extractProviderAuth("x.ts", source('{type:"api_key",in:"header",name:"Authorization",field:"apiKey",basic:{username:"{{apiKey}}",password:""}}'));
    expect(out.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
    expect(out.setupFields).toEqual([{ key: "apiKey", required: true, secret: true }]);
  });
  test("rejects OAuth, dynamic base URLs, and ambiguous proxies", () => {
    expect(() => extractProviderAuth("x.ts", source('{type:"oauth2",in:"header",name:"Authorization",field:"token"}'))).toThrow(/AUTH_UNSUPPORTED/);
    expect(() => extractProviderAuth("x.ts", source('{type:"api_key",in:"header",name:"X",field:"key"}', "https://{{host}}.example.test"))).toThrow(/AUTH_UNSAFE_BASE/);
    expect(() => extractProviderAuth("x.ts", `${source('{type:"api_key",in:"header",name:"X",field:"key"}')} defineProviderProxy(service,cfg);`)).toThrow(/AUTH_AMBIGUOUS/);
  });
  test("does not execute imports or calls", () => {
    expect(() => extractProviderAuth("x.ts", `import evil from "evil"; const cfg={baseUrl:"https://api.example.test",auth:{type:"api_key",in:"header",name:"X",field:"key"}}; defineProviderProxy(evil,cfg);`)).not.toThrow();
  });
});
