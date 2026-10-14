import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);

const credentials = { apiKey: "fixturekey", apiKeyId: "keyid" };

function stubFetch(responder: (request: Request) => Response) {
  let calls = 0;
  const fetch = async (input: string, init?: RequestInit) => {
    calls += 1;
    return responder(new Request(input, init));
  };
  return { fetch, calls: () => calls };
}

describe("blaze-meter-performance declarative actions", () => {
  it("rejects a missing required field before any fetch", async () => {
    const stub = stubFetch(() => new Response("{}", { status: 200 }));
    await expect(
      actions["tests.validate"]!({ ...credentials, testId: 1234567, fetch: stub.fetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(stub.calls()).toBe(0);
  });

  it("rejects an undeclared extra input field", async () => {
    const stub = stubFetch(() => new Response("{}", { status: 201 }));
    await expect(
      actions["projects.create"]!({
        ...credentials,
        name: "Project",
        workspaceId: 123456,
        unexpected: true,
        fetch: stub.fetch,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(stub.calls()).toBe(0);
  });

  it("omits absent optional query parameters", async () => {
    const seen: string[] = [];
    await actions["tests.list"]!({
      ...credentials,
      workspaceId: 123456,
      fetch: async (input: string, init?: RequestInit) => {
        seen.push(new URL(String(input)).searchParams.toString());
        return new Response(JSON.stringify({ api_version: 4, error: null, result: [] }), { status: 200 });
      },
    });
    expect(seen).toEqual(["workspaceId=123456"]);
  });

  it("renders repeated array query parameters", async () => {
    let url: URL | undefined;
    await actions["private-locations.list"]!({
      ...credentials,
      accountId: 123429,
      types: ["small", "large"],
      fetch: async (input: string, init?: RequestInit) => {
        url = new URL(String(input));
        return new Response(JSON.stringify({ api_version: 4, error: null, result: [] }), { status: 200 });
      },
    });
    expect(url!.searchParams.getAll("types[]")).toEqual(["small", "large"]);
  });

  it("uploads file bytes as a raw octet-stream body", async () => {
    let captured: Request | undefined;
    const result = await actions["tests.files.upload"]!({
      ...credentials,
      testId: 1234567,
      content: "jmeter-test-plan-bytes",
      fetch: async (input: string, init?: RequestInit) => {
        captured = new Request(input, init);
        return new Response(JSON.stringify({ api_version: 4, error: null, result: { id: 1234567 } }), { status: 201 });
      },
    });
    expect(captured!.headers.get("content-type")).toBe("application/octet-stream");
    expect(await captured!.text()).toBe("jmeter-test-plan-bytes");
    expect(result).toMatchObject({ connector: "blaze-meter-performance", action: "tests.files.upload", source: "provider" });
  });

  it("rejects a non-object success body under the object output schema", async () => {
    await expect(
      actions["folders.list"]!({
        ...credentials,
        workspaceId: 123456,
        fetch: async () => new Response("[]", { status: 200 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  it("maps a rate-limited response to a typed retryable error", async () => {
    await expect(
      actions["accounts.list"]!({
        ...credentials,
        fetch: async () => new Response(JSON.stringify({ error: { message: "Too many requests" } }), { status: 429 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});
