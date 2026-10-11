import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { binaryActions } from "../src/binary";

const caseDir = join(import.meta.dir, "../fixtures/cases");

function load(file: string) {
  return JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
    id: string;
    operation: string;
    input: Record<string, unknown>;
    credentials: Record<string, string>;
    exchanges: Array<{
      request: { method: string; url: string; headers?: Record<string, string>; body: null };
      response: { status: number; headers?: Record<string, string>; bodyFile: string };
    }>;
    expected: { kind: "success"; resultFile: string };
  };
}

describe("stripe binary handlers", () => {
  const files = ["files-contents-success.json", "files-create-success.json", "quotes-pdf-success.json"];

  test("runs file upload and binary download fixtures", async () => {
    expect(files).toEqual(["files-contents-success.json", "files-create-success.json", "quotes-pdf-success.json"]);
    for (const file of files) {
      const raw = load(file);
      const action = binaryActions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      const exchange = raw.exchanges[0]!;
      let calls = 0;
      const result = await action!({
        ...raw.input,
        ...raw.credentials,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          calls += 1;
          const url = String(input instanceof Request ? input.url : input);
          expect(url, raw.id).toBe(exchange.request.url);
          expect(String(init?.method ?? "GET").toUpperCase(), raw.id).toBe(exchange.request.method);
          const headers = new Headers(init?.headers);
          expect(headers.get("authorization"), raw.id).toBe("Bearer fixture-stripe-key");
          expect(headers.get("stripe-version"), raw.id).toBe("2026-09-30.endive");
          expect(headers.get("accept"), raw.id).toBe(exchange.request.headers?.accept ?? null);
          if (raw.operation === "files.create") {
            expect(init?.body, raw.id).toBeInstanceOf(FormData);
            const form = init?.body as FormData;
            expect(form.get("purpose")).toBe("dispute_evidence");
            const uploaded = form.get("file");
            expect(uploaded).toBeInstanceOf(File);
            expect((uploaded as File).name).toBe("evidence.txt");
            expect(new Uint8Array(await (uploaded as File).arrayBuffer())).toEqual(new Uint8Array(Buffer.from("aGVsbG8=", "base64")));
          } else {
            expect(init?.body ?? null, raw.id).toBeNull();
          }
          const encoded = (exchange.response as { bodyBase64?: string }).bodyBase64;
          const bytes = typeof encoded === "string"
            ? Buffer.from(encoded, "base64")
            : readFileSync(join(dirname(join(caseDir, file)), exchange.response.bodyFile));
          return new Response(bytes, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(calls, raw.id).toBe(1);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(result).toEqual(expected);
    }
  });

  test("rejects a file upload before fetch when the payload is not base64", async () => {
    let calls = 0;
    await expect(binaryActions["files.create"]!({
      apiKey: "secret-key",
      purpose: "dispute_evidence",
      file_name: "evidence.txt",
      content_base64: "%%%",
      fetch: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
  });

  test("redacts the secret key from an upstream file error", async () => {
    await expect(binaryActions["files.contents"]!({
      apiKey: "sk_test_secret",
      file: "file_fix1",
      fetch: async () => new Response(JSON.stringify({ error: { message: "bad key sk_test_secret" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "bad key [redacted]",
    });
  });
});
