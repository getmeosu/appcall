import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const envelope = {
  data: { document_types: [{ title: "Invoice", value: "invoice" }], user_id: "user_fixture" },
  error: "",
  message: "",
  status: "success",
  status_code: 200,
};

describe("Docsumo contract", () => {
  test("sends the apikey header and does not follow response links", async () => {
    const seen: Request[] = [];
    const result = await actions["document-types.user"]!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({
          ...envelope,
          data: { ...envelope.data, next: "https://evil.example/next" },
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("apikey")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("x-api-key")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.host).toBe("app.docsumo.com");
    expect(url.pathname).toBe("/api/v1/eevee/apikey/limit/");
    expect(url.search).toBe("");
    expect(result.data.data.user_id).toBe("user_fixture");
  });

  test("encodes a table id and posts an empty-row request with no body", async () => {
    const seen: Request[] = [];
    await actions["tables.add-row"]!({
      apiKey: "secret",
      ddid: "dd/1001",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "success", status_code: 200, error: "", data: [] });
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/raichu/drop_down/db/addrow/dd%2F1001/");
  });

  test("posts one JSON body when creating a folder", async () => {
    const seen: Request[] = [];
    await actions["folders.create"]!({
      apiKey: "secret",
      folderName: "myinvoices",
      type: "invoice",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ data: { folder_id: "folder_fixture_1" }, error: "", status: "success" });
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"folder_name":"myinvoices","type":"invoice"}');
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/mew/folder/add/");
  });

  test("rejects a free-form URL, a dot segment, malformed JSON output, 401, and 429", async () => {
    await expect(actions["documents.list"]!({
      apiKey: "secret",
      url: "https://evil.example",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tables.get"]!({
      apiKey: "secret",
      ddid: "..",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["document-types.user"]!({
      apiKey: "secret",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["document-types.user"]!({
      apiKey: "secret",
      fetch: async () => response({ error: "token is invalid", message: "" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["document-types.user"]!({
      apiKey: "secret",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
