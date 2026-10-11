import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);

describe("affinda deepened HTTP actions", () => {
  test("creates a document from a URL as form-urlencoded", async () => {
    let captured: Request | undefined;
    const result = await actions["documents.create"]!({
      apiKey: "fixturekey",
      region: "api",
      url: "https://example.com/resume.pdf",
      workspace: "wksResume1",
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(JSON.stringify({ meta: { identifier: "docExample2" } }), { status: 201 });
      },
    });
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://api.affinda.com/v3/documents");
    expect(captured?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(captured?.headers.get("authorization")).toBe("Bearer fixturekey");
    expect(await captured!.text()).toBe("url=https%3A%2F%2Fexample.com%2Fresume.pdf&workspace=wksResume1");
    expect(result).toMatchObject({
      connector: "affinda",
      action: "documents.create",
      data: { meta: { identifier: "docExample2" } },
    });
  });

  test("returns a static envelope for 204 collection deletes", async () => {
    const result = await actions["collections.delete"]!({
      apiKey: "fixturekey",
      region: "api",
      identifier: "colInvoice1",
      fetch: async () => new Response(null, { status: 204 }),
    });
    expect(result).toEqual({
      connector: "affinda",
      action: "collections.delete",
      source: "provider",
      deleted: true,
      identifier: "colInvoice1",
    });
  });

  test("downloads a redacted document as text", async () => {
    const result = await actions["documents.redacted"]!({
      apiKey: "fixturekey",
      region: "api",
      identifier: "docExample1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        expect(request.method).toBe("GET");
        expect(new URL(request.url).pathname).toBe("/v3/documents/docExample1/redacted");
        return new Response("%PDF-1.4 fixture", { status: 200 });
      },
    });
    expect(result).toMatchObject({ action: "documents.redacted", data: "%PDF-1.4 fixture" });
  });

  test("posts a raw annotation array for batch create", async () => {
    let body: string | null = null;
    await actions["annotations.batchCreate"]!({
      apiKey: "fixturekey",
      region: "api",
      annotations: [{ document: "docExample1", pageIndex: 0 }],
      fetch: async (input, init) => {
        body = init?.body == null ? null : String(init.body);
        expect(new URL(String(input)).pathname).toBe("/v3/annotations/batch_create");
        return new Response(JSON.stringify([{ id: 11 }]), { status: 201 });
      },
    });
    expect(body).toBe('[{"document":"docExample1","pageIndex":0}]');
  });

  test("rejects an undeclared extra input field", async () => {
    await expect(
      actions.healthcheck!({ apiKey: "fixturekey", region: "api", unexpected: true, fetch: async () => new Response("[]") }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});
