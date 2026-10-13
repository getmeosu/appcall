import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const vin = "WBAFR7C57CC811956";

describe("CarsXE contract", () => {
  test("sends the API key as the key query parameter on the fixed host", async () => {
    const seen: Request[] = [];
    await actions["specs.get"]!({
      apiKey: "secret",
      vin,
      deepdata: "1",
      disableIntVINDecoding: "1",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, attributes: { make: "BMW" } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.carsxe.com");
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/specs");
    expect(url.searchParams.get("key")).toBe("secret");
    expect(url.searchParams.get("vin")).toBe(vin);
    expect(url.searchParams.get("deepdata")).toBe("1");
    expect(url.searchParams.get("disableIntVINDecoding")).toBe("1");
    expect(url.searchParams.get("format")).toBe("json");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen).toHaveLength(1);
  });

  test("keeps plate recognition on api.carsxe.com when the JSON body contains an image URL", async () => {
    const seen: Request[] = [];
    await actions["plates.recognize"]!({
      apiKey: "secret",
      image_url: "https://evil.example/plate.jpg",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, results: [] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.carsxe.com");
    expect(url.pathname).toBe("/platerecognition");
    expect(url.searchParams.get("key")).toBe("secret");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe("{\"image_url\":\"https://evil.example/plate.jpg\"}");
    expect(seen).toHaveLength(1);
  });

  test("submits one JSON VIN array and does not poll", async () => {
    const seen: Request[] = [];
    await actions["recalls-batch.submit"]!({
      apiKey: "secret",
      vins: ["1HGBH41JXMN109186"],
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, data: { batchId: "brb_fixture", status: "uploading" } }, 202);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/recalls-batch/submit");
    expect(seen[0].method).toBe("POST");
    expect(await seen[0].text()).toBe("{\"vins\":[\"1HGBH41JXMN109186\"]}");
    expect(seen).toHaveLength(1);
  });

  test("uses documented image filters and pins format to json", async () => {
    const seen: Request[] = [];
    await actions["images.get"]!({
      apiKey: "secret",
      make: "Toyota",
      model: "Camry",
      angle: "back",
      validate: false,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, images: [] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/images");
    expect(url.searchParams.get("angle")).toBe("back");
    expect(url.searchParams.get("validate")).toBe("false");
    expect(url.searchParams.get("format")).toBe("json");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const fetch = async () => response({});
    await expect(actions["specs.get"]!({ apiKey: "secret", vin: "short", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["images.get"]!({ apiKey: "secret", make: "Toyota", model: "Camry", angle: "rear", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["recalls-batch.submit"]!({ apiKey: "secret", vins: ["1HGBH41JXMN109186"], webhookUrl: "https://evil.example/hook", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["specs.get"]!({ apiKey: "secret", vin, fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["specs.get"]!({ apiKey: "secret", vin, fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["specs.get"]!({ apiKey: "secret", vin, fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    expect(actions["recalls.get"]).toBeUndefined();
    expect(actions["recalls-batch.get"]).toBeUndefined();
  });
});
