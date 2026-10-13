import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

const credits = { onDemand: { available: 42 }, subscription: null };

describe("EmailListVerify contract", () => {
  test("uses the documented x-api-key host and does not take a URL", () => {
    expect(manifest.key).toBe("emaillistverify");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["api.emaillistverify.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.emaillistverify.com");
    expect(manifest.http.baseUrl).not.toContain("{{");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    for (const operation of Object.values(manifest.operations)) {
      expect(operation.request?.baseUrl).toBeUndefined();
      expect(JSON.stringify(operation.inputSchema)).not.toContain("\"url\"");
    }
  });

  test("healthcheck is a body-less credits read", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(credits);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.emaillistverify.com/api/credits");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(result).toMatchObject({ connector: "emaillistverify", action: "healthcheck", source: "provider", data: credits });
  });

  test("checks a disposable domain with a query and no body", async () => {
    const seen: Request[] = [];
    await actions["domains.checkDisposable"]!({
      apiKey: "secret",
      domain: "temporarydomain.net",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ domain: "temporarydomain.net", result: "ok" }, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://api.emaillistverify.com/api/checkDisposable?domain=temporarydomain.net");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
  });

  test("encodes the email job id and sends one JSON blacklist body", async () => {
    const seen: Request[] = [];
    await actions["emailJobs.get"]!({
      apiKey: "secret",
      id: "job/1",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ id: "job/1", status: "processing" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/emailJobs/job%2F1");
    expect(seen[0].body).toBeNull();
    seen.length = 0;
    await actions["blacklists.check"]!({
      apiKey: "secret",
      value: "172.75.233.15",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ type: "IPv4", value: "172.75.233.15", blacklists: [] }, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe("{\"value\":\"172.75.233.15\"}");
    expect(seen).toHaveLength(1);
  });

  test("wraps a JSON contact array and rejects bad calls", async () => {
    const found = await actions["contacts.find"]!({
      apiKey: "secret",
      domain: "connelycorp.com",
      fetch: async () => response([{ email: "adela@connelycorp.com", confidence: "medium" }], 201),
    });
    expect(found.data).toEqual([{ email: "adela@connelycorp.com", confidence: "medium" }]);
    await expect(actions["emails.verifyDetailed"]!({ apiKey: "secret", email: "", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({ apiKey: "secret", url: "https://evil.example", fetch: async () => response(credits) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({ apiKey: "secret", fetch: async () => response("ok") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({ apiKey: "secret", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({ apiKey: "secret", fetch: async () => response({ message: "Invalid api key" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["maillists.progress"]!({ apiKey: "secret", id: "file-1", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
