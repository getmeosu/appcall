import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { pineconeActions } from "../src/actions";
import { pineconeHost } from "../src/http";
import manifest from "../manifest.json";

const actions = pineconeActions(compileDeclarativeConnector(manifest as never).actions);

describe("pinecone hosted host checks", () => {
  test("accepts a hostname or https URL under pinecone.io", () => {
    expect(pineconeHost("docs-example.svc.aped-4627-b74a.pinecone.io", "index_host")).toBe(
      "https://docs-example.svc.aped-4627-b74a.pinecone.io",
    );
    expect(pineconeHost("https://prod-1-data.ke.pinecone.io/chat", "assistant_host")).toBe(
      "https://prod-1-data.ke.pinecone.io",
    );
  });

  test("rejects caller hosts that are not pinecone.io subdomains", () => {
    expect(() => pineconeHost("https://evil.example", "index_host")).toThrow();
    expect(() => pineconeHost("http://docs-example.svc.pinecone.io", "index_host")).toThrow();
    expect(() => pineconeHost("https://user:pass@docs-example.svc.pinecone.io", "index_host")).toThrow();
    expect(() => pineconeHost("pinecone.io", "index_host")).toThrow();
  });

  test("query uses the index host, not api.pinecone.io", async () => {
    const urls: string[] = [];
    await actions["vectors.query"]!({
      apiKey: "pcsk_fixture",
      indexHost: "docs-example-govk0nt.svc.aped-4627-b74a.pinecone.io",
      topK: 1,
      vector: [0.1],
      fetch: async (url: RequestInfo | URL) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ matches: [] }), { status: 200 });
      },
    });
    expect(urls).toEqual(["https://docs-example-govk0nt.svc.aped-4627-b74a.pinecone.io/query"]);
  });

  test("rejects an off-domain index host before fetch", async () => {
    let fetched = false;
    await expect(
      actions["vectors.query"]!({
        apiKey: "pcsk_fixture",
        indexHost: "https://evil.example",
        topK: 1,
        vector: [0.1],
        fetch: async () => {
          fetched = true;
          return new Response("{}", { status: 200 });
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(fetched).toBe(false);
  });

  test("discovers assistant host from the control plane when omitted", async () => {
    const urls: string[] = [];
    await actions["assistants.files.list"]!({
      apiKey: "pcsk_fixture",
      assistant_name: "docs-assistant",
      fetch: async (url: RequestInfo | URL) => {
        urls.push(String(url));
        if (String(url).includes("/assistant/assistants/")) {
          return new Response(JSON.stringify({ name: "docs-assistant", host: "prod-1-data.ke.pinecone.io" }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      },
    });
    expect(urls).toEqual([
      "https://api.pinecone.io/assistant/assistants/docs-assistant",
      "https://prod-1-data.ke.pinecone.io/files/docs-assistant",
    ]);
  });
});
