import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const schemaId = "0631f213-ca91-41e0-9a88-7430c7d0ca28";
const savedSchema = {
  name: "last - email",
  fields: [{ key: "email", type: "email", label: "email" }],
  settings: { importIdentifier: "contacts" },
};

describe("Dromo contract", () => {
  test("sends the backend license key on app.dromo.io and wraps the schema array", async () => {
    const seen: Request[] = [];
    const result = await actions["schemas.list"]!({
      apiKey: "secret",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ id: schemaId, name: "last - email" }]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("app.dromo.io");
    expect(url.pathname).toBe("/api/v1/schemas/");
    expect(url.search).toBe("");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("x-dromo-license-key")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result.data).toEqual([{ id: schemaId, name: "last - email" }]);
    expect(seen).toHaveLength(1);
  });

  test("encodes the schema id and does not follow links", async () => {
    const seen: Request[] = [];
    await actions["schemas.get"]!({
      apiKey: "secret",
      id: "abc/def",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: "abc/def", name: "encoded", fields: [], settings: {} });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v1/schemas/abc%2Fdef/");
    expect(url.hostname).toBe("app.dromo.io");
    expect(seen[0].method).toBe("GET");
    expect(seen).toHaveLength(1);
  });

  test("creates a headless import as one JSON post and does not upload the file", async () => {
    const seen: Request[] = [];
    const result = await actions["headless-imports.create"]!({
      apiKey: "secret",
      schema_id: schemaId,
      initial_data: [{ product: "widget1", transaction: "foo123" }],
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          id: schemaId,
          status: "PENDING",
          upload: "https://evil.example/presigned",
        }, 201);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("app.dromo.io");
    expect(url.pathname).toBe("/api/v1/headless/imports/");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      "{\"schema_id\":\"0631f213-ca91-41e0-9a88-7430c7d0ca28\",\"initial_data\":[{\"product\":\"widget1\",\"transaction\":\"foo123\"}]}",
    );
    expect(result.data.status).toBe("PENDING");
    expect(seen).toHaveLength(1);
  });

  test("lists uploads with index query parameters and omits unset bounds", async () => {
    const seen: Request[] = [];
    await actions["uploads.list"]!({
      apiKey: "secret",
      start: 0,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ start: 0, end: 10000, total_num_uploads: 0, data: [] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v1/uploads/");
    expect(url.searchParams.get("start")).toBe("0");
    expect(url.searchParams.get("end")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen).toHaveLength(1);
  });

  test("replaces a schema with one JSON put", async () => {
    const seen: Request[] = [];
    await actions["schemas.update"]!({
      apiKey: "secret",
      id: schemaId,
      ...savedSchema,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: schemaId, ...savedSchema });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe(`/api/v1/schemas/${schemaId}/`);
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      "{\"name\":\"last - email\",\"fields\":[{\"key\":\"email\",\"type\":\"email\",\"label\":\"email\"}],\"settings\":{\"importIdentifier\":\"contacts\"}}",
    );
    expect(seen).toHaveLength(1);
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(actions["schemas.get"]!({
      apiKey: "secret",
      id: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["headless-imports.create"]!({
      apiKey: "secret",
      schema_id: schemaId,
      upload_url: "https://evil.example/put",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["headless-imports.create"]!({
      apiKey: "secret",
      schema_id: schemaId,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["schemas.list"]!({
      apiKey: "secret",
      fetch: async () => response({ id: schemaId }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["schemas.list"]!({
      apiKey: "secret",
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["schemas.list"]!({
      apiKey: "secret",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
