import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const envelope = { success: true, message: "", data: { uuid: "754a46c5-7693-43a1-9cd4-aedabd273f57" } };

describe("Dynamic Mockups contract", () => {
  test("sends x-api-key on the fixed host and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["mockups.list"]!({
      apiKey: "secret",
      name: "FixtureMug",
      include_all_catalogs: true,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("app.dynamicmockups.com");
    expect(url.pathname).toBe("/api/v1/mockups");
    expect(url.searchParams.get("name")).toBe("FixtureMug");
    expect(url.searchParams.get("include_all_catalogs")).toBe("true");
    expect(url.searchParams.get("catalog_uuid")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(result.data).toEqual(envelope);
    expect(seen).toHaveLength(1);
  });

  test("creates a mockup with one JSON body and does not fetch the image URL", async () => {
    const seen: Request[] = [];
    await actions["mockanything.create"]!({
      apiKey: "secret",
      image_url: "https://evil.example/photo.png",
      name: "Fixture",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, message: "", data: { task_id: "task-1", status: "PENDING" } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("app.dynamicmockups.com");
    expect(url.pathname).toBe("/api/v1/mock-anything/create");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(await seen[0].text()).toBe("{\"image_url\":\"https://evil.example/photo.png\",\"name\":\"Fixture\"}");
    expect(seen).toHaveLength(1);
  });

  test("encodes the product UUID on one route", async () => {
    const seen: Request[] = [];
    await actions["mockanything.product.get"]!({
      apiKey: "secret",
      product_uuid: "prod/a",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v1/mock-anything/products/prod%2Fa");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen).toHaveLength(1);
  });

  test("submits one motion JSON request and does not poll", async () => {
    const seen: Request[] = [];
    await actions["motion.submit"]!({
      apiKey: "secret",
      start_image_url: "https://example.com/product.jpg",
      prompt: "slow push-in",
      generate_audio: false,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, message: "", data: { request_id: "req_1", status: "IN_QUEUE" } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v1/motion-mockups/submit");
    expect(seen[0].method).toBe("POST");
    expect(await seen[0].text()).toBe("{\"start_image_url\":\"https://example.com/product.jpg\",\"prompt\":\"slow push-in\",\"generate_audio\":false}");
    expect(seen).toHaveLength(1);
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const fetch = async () => response({});
    await expect(actions["mockanything.products.search"]!({ apiKey: "secret", query: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["mockanything.product.get"]!({ apiKey: "secret", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["mockanything.create"]!({ apiKey: "secret", prompt: "mug", image_file: { name: "a.png" }, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["mockanything.create"]!({ apiKey: "secret", prompt: "mug", wait_timeout_seconds: 0, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["mockanything.create"]!({ apiKey: "secret", prompt: "mug", aspect_ratio: "1:1", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["mockups.list"]!({ apiKey: "secret", url: "https://evil.example", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["motion.submit"]!({ apiKey: "secret", start_image_url: "https://example.com/a.jpg", baseUrl: "https://evil.example", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["mockanything.status.get"]!({ apiKey: "secret", task_id: "task-1", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["mockups.list"]!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["mockups.list"]!({ apiKey: "secret", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    expect(actions["generation-options.get"]).toBeUndefined();
    expect(actions["catalogs.list"]).toBeUndefined();
    expect(actions["renders.create"]).toBeUndefined();
  });
});
