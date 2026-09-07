import { describe, expect, test } from "bun:test";
import { createFetchHandler } from "../src/serve";

const describeBody = JSON.stringify({ id: "req_serve_test", method: "runner.describe" });

function rpcRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://runner.local/rpc", {
    method: "POST",
    headers,
    body: describeBody,
  });
}

describe("createFetchHandler token gate", () => {
  test("rejects /rpc without Authorization when token is set", async () => {
    const handler = createFetchHandler({ token: "tok-test-1" });
    const response = await handler(rpcRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("rejects /rpc with the wrong token", async () => {
    const handler = createFetchHandler({ token: "tok-test-1" });
    const response = await handler(rpcRequest({ authorization: "Bearer tok-test-2" }));

    expect(response.status).toBe(401);
  });

  test("rejects a non-bearer scheme even with the right secret", async () => {
    const handler = createFetchHandler({ token: "tok-test-1" });
    const response = await handler(rpcRequest({ authorization: "Basic tok-test-1" }));

    expect(response.status).toBe(401);
  });

  test("serves /rpc with the correct bearer token", async () => {
    const handler = createFetchHandler({ token: "tok-test-1" });
    const response = await handler(rpcRequest({ authorization: "Bearer tok-test-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.runner).toBe("appcall-bun");
  });

  test("stays open when no token is configured", async () => {
    const handler = createFetchHandler({});
    const response = await handler(rpcRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("treats a blank token as unset", async () => {
    const handler = createFetchHandler({ token: "   " });
    const response = await handler(rpcRequest());

    expect(response.status).toBe(200);
  });

  test("serves /healthz without auth even when token is set", async () => {
    const handler = createFetchHandler({ token: "tok-test-1" });
    const response = await handler(new Request("http://runner.local/healthz"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.runner).toBe("appcall-bun");
  });

  test("unknown routes keep the 404 envelope", async () => {
    const handler = createFetchHandler({ token: "tok-test-1" });
    const response = await handler(new Request("http://runner.local/nope"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
