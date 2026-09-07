import { describe, expect, test } from "bun:test";
import docFixture from "../fixtures/doc.json";
import { validateGetDocumentInput, parseDocumentResponse, createDocsClient } from "../src/docs";
import { getDocument } from "../src/actions";

describe("google-workspace docs", () => {
  test("validates get document input", () => {
    expect(validateGetDocumentInput({ documentId: "1abc" })).toEqual({ documentId: "1abc" });
    expect(validateGetDocumentInput({ id: "1abc" })).toEqual({ documentId: "1abc" });
    expect(() => validateGetDocumentInput({})).toThrow();
  });

  test("parses document response from fixture", () => {
    const result = parseDocumentResponse(docFixture);

    expect(result.documentId).toBe("1aBcDeFgHiJkLmNoPqRsTuVwXyZ");
    expect(result.title).toBe("Project Requirements");
    expect(result.revisionId).toBe("1");
    expect(result.body).toBeDefined();
  });

  test("get document validates without access token", () => {
    const result = getDocument({ documentId: "1abc" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("docs.get");
  });

  test("get document calls Docs API and returns data", async () => {
    const requests: Request[] = [];
    const client = createDocsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(docFixture);
      },
    });

    const result = await client.getDocument({ documentId: "1aBcDeFgHiJkLmNoPqRsTuVwXyZ" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v1/documents/1aBcDeFgHiJkLmNoPqRsTuVwXyZ");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(requests[0].url).toContain("includeTabsContent=true");
    expect(result.title).toBe("Project Requirements");
    expect(result.revisionId).toBe("1");
  });
});
