import { describe, expect, test } from "bun:test";
import { executeTransport } from "../src/handlers";

// SEC-SETUP-1: transport ops build https://{restHost}/restapi/v2.1 themselves; the
// host must be under docusign.net or docusign.com.
const op = "envelopes.documents.get";
const input = { accessToken: "t", accountId: "acct1", envelopeId: "env1", documentId: "1" };

describe("docusign transport restHost", () => {
  test("refuses a non-DocuSign host before any request", async () => {
    for (const restHost of ["evil.example", "docusign.net.evil.example", "evildocusign.net", "docusign.net", "demo.docusign.net:443", "a@demo.docusign.net", "127.0.0.1", "localhost", "."]) {
      let fetched = false;
      await expect(executeTransport(op, { ...input, restHost, fetch: async () => { fetched = true; return new Response(""); } })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
      expect(fetched).toBe(false);
    }
  });
  test("accepts DocuSign hosts in stored spellings", async () => {
    for (const restHost of ["demo.docusign.net", "https://NA2.docusign.net/"]) {
      const urls: string[] = [];
      await executeTransport(op, { ...input, restHost, fetch: async (url: RequestInfo | URL) => { urls.push(String(url)); return new Response("pdf", { status: 200, headers: { "content-type": "application/pdf" } }); } }).catch(() => undefined);
      expect(urls.length).toBe(1);
      expect(new URL(urls[0]!).hostname).toMatch(/^(demo|na2)\.docusign\.net$/);
    }
  });
});
