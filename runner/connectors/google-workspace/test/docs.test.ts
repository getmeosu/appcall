import { describe, expect, test } from "bun:test";
import docFixture from "../fixtures/doc.json";
import docTabsSingleFixture from "../fixtures/doc_tabs_single.json";
import docTabsMultipleNestedFixture from "../fixtures/doc_tabs_multiple_nested.json";
import { validateGetDocumentInput, parseDocumentResponse, createDocsClient } from "../src/docs";
import { createGoogleClient } from "../src/http";
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
    expect(result.body).toEqual(docFixture.body);
    expect(result.tabs).toBeUndefined();
  });

  test("parses the first document tab body from a modern single-tab response", () => {
    const result = parseDocumentResponse(docTabsSingleFixture);

    expect(result.body).toEqual(docTabsSingleFixture.tabs[0].documentTab.body);
    expect(result.tabs).toEqual(docTabsSingleFixture.tabs);
  });

  test("preserves multiple root tabs and recursively nested child tabs", () => {
    const result = parseDocumentResponse(docTabsMultipleNestedFixture);

    expect(result.body).toEqual(docTabsMultipleNestedFixture.tabs[0].documentTab.body);
    expect(result.tabs).toEqual(docTabsMultipleNestedFixture.tabs);
    expect(result.tabs?.[0].childTabs?.[0].childTabs?.[0].documentTab.body).toEqual(
      docTabsMultipleNestedFixture.tabs[0].childTabs[0].childTabs[0].documentTab.body,
    );
    expect(result.tabs?.[1].documentTab.body).toEqual(
      docTabsMultipleNestedFixture.tabs[1].documentTab.body,
    );
  });

  test("serializes the complete tab hierarchy through the public docs.get action", async () => {
    const result = await getDocument({
      accessToken: "ya29.test-token",
      documentId: docTabsMultipleNestedFixture.documentId,
      fetch: async () => Response.json(docTabsMultipleNestedFixture),
    });
    const serialized = JSON.parse(JSON.stringify(result));

    expect(serialized.body).toEqual(docTabsMultipleNestedFixture.tabs[0].documentTab.body);
    expect(serialized.tabs).toEqual(docTabsMultipleNestedFixture.tabs);
    expect(serialized.tabs[0].childTabs[0].childTabs[0].documentTab.body).toEqual(
      docTabsMultipleNestedFixture.tabs[0].childTabs[0].childTabs[0].documentTab.body,
    );
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

  test("selects response budgets for docs.get and docs.create independently", async () => {
    const responseLargerThanCreateBudget = JSON.stringify({
      documentId: "created-document",
      title: "Created document",
      revisionId: "1",
    }) + " ".repeat(1_048_576);
    const client = createDocsClient({
      accessToken: "ya29.test-token",
      fetch: async () => new Response(responseLargerThanCreateBudget),
    });

    await expect(client.getDocument({ documentId: "read-document" })).resolves.toMatchObject({
      documentId: "created-document",
    });
    await expect(client.createDocument({ title: "Created document" })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
  });

  test("fails closed for an unsupported manifest operation budget", () => {
    expect(() => createGoogleClient({
      accessToken: "ya29.test-token",
      operation: "docs.missing",
    })).toThrow("Outbound operation budget is not supported.");
  });
});
