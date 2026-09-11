import { describe, expect, test } from "bun:test";
import docCreateFixture from "../fixtures/doc_create.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import { createDocsClient, validateCreateDocumentInput } from "../src/docs";
import { parseGoogleRetryAfter } from "../src/http";

const docsOperations: Array<(client: ReturnType<typeof createDocsClient>) => Promise<unknown>> = [
  (client) => client.getDocument({ documentId: "doc-id" }),
  (client) => client.createDocument({ title: "Test" }),
];

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
    expect(requests[0].url).toBe("https://docs.googleapis.com/v1/documents");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({ title: "My New Document" });
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

  test("all Docs operations preserve rate-limit codes and valid Retry-After", async () => {
    for (const operation of docsOperations) {
      const client = createDocsClient({
        accessToken: "token",
        fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
          status: 429,
          headers: { "Retry-After": "37" },
        }),
      });

      await expect(operation(client)).rejects.toMatchObject({
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        retryAfterSeconds: 37,
      });
    }
  });

  test("parses an HTTP-date Retry-After relative to the supplied clock", () => {
    const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(parseGoogleRetryAfter("Wed, 21 Oct 2015 07:29:00 GMT", now)).toBe(60);
  });

  test("all Docs operations honor a future HTTP-date Retry-After", async () => {
    const retryAfter = new Date(Date.now() + 120_000).toUTCString();
    for (const operation of docsOperations) {
      const client = createDocsClient({
        accessToken: "token",
        fetch: async () => new Response(JSON.stringify({
          error: { code: 429, message: "Rate Limit Exceeded" },
        }), {
          status: 429,
          headers: { "Retry-After": retryAfter },
        }),
      });

      const error = await operation(client).catch((value: unknown) => value as Record<string, unknown>);
      expect(error).toMatchObject({
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
      });
      expect(error.retryAfterSeconds).toBeGreaterThan(100);
      expect(error.retryAfterSeconds).toBeLessThanOrEqual(120);
    }
  });

  test("all Docs operations use a safe fallback for malformed Retry-After", async () => {
    for (const retryAfter of ["not-a-number", "0", "-5", "999999999"]) {
      for (const operation of docsOperations) {
        const client = createDocsClient({
          accessToken: "token",
          fetch: async () => new Response(JSON.stringify({
            error: { code: 429, message: "Rate Limit Exceeded" },
          }), {
            status: 429,
            headers: { "Retry-After": retryAfter },
          }),
        });

        const error = await operation(client).catch((value: unknown) => value as Record<string, unknown>);
        expect(error).toMatchObject({
          ok: false,
          code: "CONNECTOR_RATE_LIMITED",
          retryAfterSeconds: 10,
        });
      }
    }
  });

  test("all Docs operations keep 400 and 401 as non-retryable upstream errors", async () => {
    for (const status of [400, 401]) {
      for (const operation of docsOperations) {
        const client = createDocsClient({
          accessToken: "token",
          fetch: async () => new Response(JSON.stringify({
            error: { code: status, status, message: status === 400 ? "Bad Request" : "Unauthorized" },
          }), { status }),
        });

        const error = await operation(client).catch((value: unknown) => value as Record<string, unknown>);
        expect(error).toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
        expect(error).not.toHaveProperty("retryAfterSeconds");
      }
    }
  });

  test("createDocument with empty title throws validation error", () => {
    expect(() => validateCreateDocumentInput({ title: "" })).toThrow();
  });
});
