import { describe, expect, it } from "bun:test";
import { uploadInvoicePdf } from "../src/upload";

const pdf = Buffer.from("%PDF-1.7\nfixture invoice\n%%EOF\n", "ascii");
const fileBase64 = pdf.toString("base64");
const credentials = { apiKey: "fixturekey", apiSecret: "fixturesecret" };

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  let request: Request | undefined;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    request = new Request(input, init);
    return new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  return { fetch, get request() { return request; } };
}

describe("chaserhq invoices.uploadPdf", () => {
  it("sends a bounded Basic-authenticated multipart PDF upload", async () => {
    const sink = mockFetch(201, { id: "inv_42", pdf_url: "https://files.example/invoice.pdf" });
    const result = await uploadInvoicePdf({
      ...credentials,
      invoiceId: "inv-42",
      fileName: "invoice-42.pdf",
      fileBase64,
      fetch: sink.fetch as typeof fetch,
    }) as Record<string, unknown>;

    const request = sink.request!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://openapi.chaserhq.com/v1/invoices/inv-42/pdf");
    expect(request.headers.get("authorization")).toBe(`Basic ${Buffer.from("fixturekey:fixturesecret").toString("base64")}`);
    expect(request.headers.get("accept")).toBe("application/json");
    expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    const form = await request.formData();
    const uploaded = form.get("file");
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe("invoice-42.pdf");
    expect((uploaded as File).type).toBe("application/pdf");
    expect(Buffer.compare(Buffer.from(await (uploaded as File).arrayBuffer()), pdf)).toBe(0);
    expect(result).toEqual({
      connector: "chaserhq",
      action: "invoices.uploadPdf",
      source: "connector",
      data: { id: "inv_42", pdf_url: "https://files.example/invoice.pdf" },
    });
  });

  it("validates credentialless calls without echoing the binary payload", () => {
    const sink = mockFetch(200, {});
    const result = uploadInvoicePdf({ invoiceId: "inv-42", fileBase64, fetch: sink.fetch as typeof fetch }) as Record<string, any>;
    expect(result.validated).toEqual({ invoiceId: "inv-42", fileName: "inv-42.pdf" });
    expect(JSON.stringify(result)).not.toContain(fileBase64);
    expect(sink.request).toBeUndefined();
  });

  it("rejects malformed PDFs, unsafe names and path traversal before network I/O", async () => {
    const sink = mockFetch(200, {});
    const invoke = (input: Record<string, unknown>) => Promise.resolve().then(() => uploadInvoicePdf({ ...credentials, fetch: sink.fetch as typeof fetch, ...input }));
    await expect(invoke({ invoiceId: "inv-42", fileBase64: Buffer.from("not a pdf").toString("base64") })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(invoke({ invoiceId: "../other", fileBase64 })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(invoke({ invoiceId: "inv-42", fileName: "../invoice.pdf", fileBase64 })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(invoke({ invoiceId: "inv-42", fileBase64: "%%invalid%%" })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(sink.request).toBeUndefined();
  });

  it("classifies rate limits and does not forward provider body text", async () => {
    const sink = mockFetch(429, { message: "secret=fixturesecret" }, { "retry-after": "17" });
    let failure: any;
    try {
      await uploadInvoicePdf({ ...credentials, invoiceId: "inv-42", fileBase64, fetch: sink.fetch as typeof fetch });
    } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
    expect(failure.message).not.toContain("fixturesecret");
  });

  it("blocks redirects and returns a safe typed failure", async () => {
    const sink = mockFetch(302, null, { location: "https://attacker.example/collect" });
    await expect(uploadInvoicePdf({ ...credentials, invoiceId: "inv-42", fileBase64, fetch: sink.fetch as typeof fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
