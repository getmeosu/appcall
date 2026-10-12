import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "account.balance.get", "pdf.info.get"] as const;
const READ_POST = new Set(["pdf.info.get", "job.check", "pdf.find", "pdf.find.table", "pdf.forms.info"]);

const COMPOSIO_TOOLS: Record<string, string> = {
  PDF_CO_ACCOUNT_BALANCE_INFO: "account.balance.get",
  PDF_CO_BARCODE_GENERATE: "barcode.generate",
  PDF_CO_CONVERT_EXCEL_TO_CSV: "convert.excel.to.csv",
  PDF_CO_CONVERT_EXCEL_TO_HTML: "convert.excel.to.html",
  PDF_CO_CONVERT_EXCEL_TO_JSON: "convert.excel.to.json",
  PDF_CO_CONVERT_EXCEL_TO_TEXT: "convert.excel.to.text",
  PDF_CO_CONVERT_EXCEL_TO_XML: "convert.excel.to.xml",
  PDF_CO_DOCUMENT_PARSER: "document.parser",
  PDF_CO_FILE_UPLOAD: "file.upload",
  PDF_CO_JOB_CHECK: "job.check",
  PDF_CO_PDF_ADD: "pdf.add",
  PDF_CO_PDF_AUTO_ROTATE: "pdf.auto.rotate",
  PDF_CO_PDF_CHANGE_TEXT_SEARCHABLE: "pdf.change.text.searchable",
  PDF_CO_PDF_COMPRESS: "pdf.compress",
  PDF_CO_PDF_CONVERT_TO_TEXT_SIMPLE: "pdf.convert.to.text.simple",
  PDF_CO_PDFCO_POST_BARCODE_GENERATE: "pdfco.post.barcode.generate",
  PDF_CO_PDFCO_POST_FILE_UPLOAD_BASE64: "pdfco.post.file.upload.base64",
  PDF_CO_PDF_DELETE_PAGES: "pdf.edit.delete-pages",
  PDF_CO_PDF_EXTRACT_ATTACHMENTS: "pdf.extract.attachments",
  PDF_CO_PDF_FIND: "pdf.find",
  PDF_CO_PDF_FIND_TABLE: "pdf.find.table",
  PDF_CO_PDF_FORMS_INFO_READER: "pdf.forms.info",
  PDF_CO_PDF_FROM_CSV: "pdf.from.csv",
  PDF_CO_PDF_FROM_DOCUMENT_TXT: "pdf.from.document.txt",
  PDF_CO_PDF_FROM_EMAIL: "pdf.from.email",
  PDF_CO_PDF_FROM_HTML: "pdf.from.html",
  PDF_CO_PDF_FROM_IMAGE: "pdf.from.image",
  PDF_CO_PDF_FROM_URL: "pdf.from.url",
  PDF_CO_PDF_INFO_READER: "pdf.info.get",
  PDF_CO_PDF_MERGE: "pdf.merge",
  PDF_CO_PDF_OPTIMIZE: "pdf.optimize",
  PDF_CO_PDF_REPLACE_TEXT_WITH_IMAGE: "pdf.replace.text.with.image",
  PDF_CO_PDF_ROTATE: "pdf.rotate",
  PDF_CO_PDF_SEARCH_AND_DELETE_TEXT: "pdf.search.and.delete.text",
  PDF_CO_PDF_SEARCH_AND_REPLACE_TEXT: "pdf.search.and.replace.text",
  PDF_CO_PDF_SECURITY_ADD: "pdf.security.add",
  PDF_CO_PDF_SECURITY_REMOVE: "pdf.security.remove",
  PDF_CO_PDF_SPLIT: "pdf.split",
  PDF_CO_PDF_TO_CSV: "pdf.convert.to.csv",
  PDF_CO_PDF_TO_HTML: "pdf.convert.to.html",
  PDF_CO_PDF_TO_IMAGE: "pdf.convert.to.image",
  PDF_CO_PDF_TO_JSON: "pdf.convert.to.json",
  PDF_CO_PDF_TO_TEXT: "pdf.convert.to.text",
  PDF_CO_PDF_TO_TIFF: "pdf.convert.to.tiff",
  PDF_CO_PDF_TO_WEBP: "pdf.convert.to.webp",
  PDF_CO_PDF_TO_XLS: "pdf.convert.to.xls",
  PDF_CO_PDF_TO_XLSX: "pdf.convert.to.xlsx",
  PDF_CO_PDF_TO_XML: "pdf.convert.to.xml",
  PDF_CO_XLS_TO_PDF: "xls.to.pdf",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("pdf-co manifest", () => {
  test("keeps origin auth, hosts, and bodyErrorPaths", () => {
    expect(manifest.key).toBe("pdf-co");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.network.allowedHosts).toEqual(["api.pdf.co"]);
    expect(manifest.http.baseUrl).toBe("https://api.pdf.co");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["error"]);
    expect(manifest.http.errors.bodyErrorPaths).not.toContain("status");
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin three operations and pdf.info.get async:false", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/account/credit/balance" });
    expect(requestOf("account.balance.get")).toMatchObject({ method: "GET", path: "/v1/account/credit/balance" });
    expect(requestOf("pdf.info.get")).toMatchObject({ method: "POST", path: "/v1/pdf/info" });
    const body = requestOf("pdf.info.get").body as Record<string, unknown>;
    expect(body.async).toBe(false);
    expect(body.url).toBe("{{url}}");
    expect(Object.keys(body)).toEqual(["async", "expiration", "password", "timeout", "url"]);
  });

  test("covers every live Composio PDF.co tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(49);
    expect(Object.keys(operations)).toHaveLength(50);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write except documented reads", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "GET" || READ_POST.has(key)) expect(operation.sideEffect, key).toBe("read");
      else if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else expect(operation.sideEffect, key).toBe("write");
    }
  });

  test("maps Composio fields onto documented PDF.co paths", () => {
    expect(requestOf("pdf.from.html").path).toBe("/v1/pdf/convert/from/url");
    expect(requestOf("pdf.from.url").path).toBe("/v1/pdf/convert/from/url");
    expect(requestOf("pdf.compress").path).toBe("/v2/pdf/compress");
    expect(requestOf("pdf.optimize").path).toBe("/v1/pdf/optimize");
    expect(requestOf("file.upload")).toMatchObject({ method: "GET", path: "/v1/file/upload/url" });
    expect(requestOf("pdfco.post.file.upload.base64").path).toBe("/v1/file/upload/base64");
    expect(requestOf("pdf.convert.to.image").path).toBe("/v1/pdf/convert/to/png");
    expect(requestOf("job.check").path).toBe("/v1/job/check");
    expect((requestOf("job.check").body as Record<string, string>).jobid).toBe("{{job_id}}");
    expect((requestOf("pdf.merge").body as Record<string, string>).url).toBe("{{urls}}");
    expect((requestOf("pdf.find").body as Record<string, string>).regex).toBe("{{regexSearch}}");
    expect((requestOf("pdf.change.text.searchable").body as Record<string, string>).lang).toBe("{{language}}");
    expect((requestOf("pdfco.post.barcode.generate").body as Record<string, string>).decorationimage).toBe(
      "{{decorationImage}}",
    );
    expect((requestOf("pdf.search.and.replace.text").body as Record<string, string>).regex).toBe("{{regexSearch}}");
    expect((requestOf("barcode.generate").body as Record<string, string>).async).toBe("{{async_}}");
  });

  test("puts Content-Type only on JSON bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });
});
