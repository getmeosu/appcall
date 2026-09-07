import { describe, expect, test } from "bun:test";
import docCreateFixture from "../fixtures/doc_create.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import { createDocsClient, validateCreateDocumentInput } from "../src/docs";

describe("google-workspace Docs extended actions", () => {
  // ─── docs.create ────────────────────────────────────────────────────────

  test("validateCreateDocumentInput accepts valid input", () => {
    const r = validateCreateDocumentInput({ title: "My New Doc" });
    expect(r.title).toBe("My New Doc");
  });

  test("validateCreateDocumentInput throws on missing title", () => {
    expect(() => validateCreateDocumentInput({})).toThrow();
    expect(() => validateCreateDocumentInput("not-object")).toThrow();
  });

  test("createDocument posts to Docs API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const client = createDocsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(docCreateFixture);
      },
    });

    const result = await client.createDocument({ title: "My New Document" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://www.googleapis.com/v1/documents");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(result.documentId).toBe("newDocId456");
    expect(result.title).toBe("My New Document");
    expect(result.revisionId).toBe("rev001");
  });

  test("createDocument throws on upstream error", async () => {
    const client = createDocsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 403, message: "Forbidden" } }),
        { status: 403 },
      ),
    });

    await expect(
      client.createDocument({ title: "Test" })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("createDocument with empty title throws validation error", () => {
    expect(() => validateCreateDocumentInput({ title: "" })).toThrow();
  });
});
