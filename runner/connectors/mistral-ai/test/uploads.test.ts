import { describe, expect, test } from "bun:test";
import { uploadFile, uploadLibraryDocument, createAudioTranscription } from "../src/uploads";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("mistral-ai multipart uploads", () => {
  test("uploads a base64 file as multipart", async () => {
    const calls: Request[] = [];
    const result = await uploadFile({
      apiKey: "token",
      purpose: "batch",
      file: { name: "batch.jsonl", content_base64: "e30K", mimeType: "application/jsonl" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Request(input, init));
        return json({ id: "file_01example", object: "file" });
      },
    });
    expect(calls[0]!.url).toBe("https://api.mistral.ai/v1/files");
    expect(calls[0]!.method).toBe("POST");
    const contentType = calls[0]!.headers.get("content-type") ?? "";
    expect(contentType.startsWith("multipart/form-data")).toBe(true);
    const form = await calls[0]!.formData();
    expect(form.get("purpose")).toBe("batch");
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect(result).toMatchObject({ connector: "mistral-ai", action: "files.upload", source: "provider" });
  });

  test("uploads a library document", async () => {
    const calls: Request[] = [];
    await uploadLibraryDocument({
      apiKey: "token",
      library_id: "lib_01example",
      file: { name: "notes.txt", content_base64: "aGVsbG8=", mimeType: "text/plain" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Request(input, init));
        return json({ id: "doc_01example" });
      },
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v1/libraries/lib_01example/documents");
  });

  test("transcribes from file_id without multipart file bytes", async () => {
    const calls: Request[] = [];
    await createAudioTranscription({
      apiKey: "token",
      model: "voxtral-mini-latest",
      file_id: "file_01example",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Request(input, init));
        return json({ text: "hello" });
      },
    });
    expect(calls[0]!.url).toBe("https://api.mistral.ai/v1/audio/transcriptions");
    const form = await calls[0]!.formData();
    expect(form.get("file_id")).toBe("file_01example");
    expect(form.get("model")).toBe("voxtral-mini-latest");
  });
});
