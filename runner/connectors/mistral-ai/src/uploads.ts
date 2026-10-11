import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";

const baseUrl = "https://api.mistral.ai";
const allowedHosts = ["api.mistral.ai"];

type RecordInput = Record<string, unknown>;

function isRecord(value: unknown): value is RecordInput {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw invalid(`${field} is required`);
  return value;
}

function invalid(message: string) {
  return { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function echo(action: string, input: unknown) {
  return { connector: "mistral-ai", action, source: "connector", validated: isRecord(input) ? input : {} };
}

async function fileFromInput(file: unknown): Promise<File> {
  if (!isRecord(file)) throw invalid("file is required");
  const name = typeof file.name === "string" && file.name.length > 0 ? file.name : "upload.bin";
  const mimeType =
    (typeof file.mimeType === "string" && file.mimeType) ||
    (typeof file.mimetype === "string" && file.mimetype) ||
    "application/octet-stream";
  if (typeof file.content_base64 === "string" && file.content_base64.length > 0) {
    const bytes = Buffer.from(file.content_base64, "base64");
    return new File([bytes], name, { type: mimeType });
  }
  if (typeof file.url === "string" && file.url.length > 0) {
    const response = await fetch(file.url);
    if (!response.ok) throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Unable to fetch file.url." };
    const bytes = new Uint8Array(await response.arrayBuffer());
    return new File([bytes], name, { type: mimeType });
  }
  throw invalid("file requires content_base64 or url");
}

function appendScalar(form: FormData, key: string, value: unknown) {
  if (value === undefined || value === null || key === "file") return;
  if (typeof value === "object") form.set(key, JSON.stringify(value));
  else form.set(key, String(value));
}

async function postForm(path: string, input: RecordInput, form: FormData, action: string, timeoutMs: number) {
  const client = createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes: 5242880,
    timeoutMs,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
  });
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${String(input.apiKey)}`, Accept: "application/json" },
      body: form,
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status === 429) throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Rate limited." };
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: response.body.slice(0, 500) };
  }
  let data: unknown = response.body;
  try {
    data = response.body.trim() === "" ? {} : JSON.parse(response.body);
  } catch {
    data = response.body;
  }
  return { connector: "mistral-ai", action, source: "provider", data };
}

export async function uploadFile(input: unknown) {
  if (!isRecord(input) || typeof input.apiKey !== "string") return echo("files.upload", input);
  if (!isRecord(input.file)) throw invalid("file is required");
  const form = new FormData();
  form.set("file", await fileFromInput(input.file));
  appendScalar(form, "purpose", input.purpose);
  appendScalar(form, "visibility", input.visibility);
  appendScalar(form, "expiry", input.expiry);
  return postForm("/v1/files", input, form, "files.upload", 60000);
}

export async function uploadLibraryDocument(input: unknown) {
  if (!isRecord(input) || typeof input.apiKey !== "string") return echo("libraries.documents.upload", input);
  const libraryId = requiredString(input.library_id, "library_id");
  const form = new FormData();
  form.set("file", await fileFromInput(input.file));
  return postForm(`/v1/libraries/${encodeURIComponent(libraryId)}/documents`, input, form, "libraries.documents.upload", 60000);
}

export async function createAudioTranscription(input: unknown) {
  if (!isRecord(input) || typeof input.apiKey !== "string") return echo("audio.transcriptions.create", input);
  const model = requiredString(input.model, "model");
  const form = new FormData();
  form.set("model", model);
  if (typeof input.file_id === "string" && input.file_id.length > 0) form.set("file_id", input.file_id);
  else if (typeof input.file_url === "string" && input.file_url.length > 0) form.set("file_url", input.file_url);
  else form.set("file", await fileFromInput(input.file));
  for (const key of ["diarize", "language", "temperature", "context_bias", "timestamp_granularities"]) {
    appendScalar(form, key, input[key]);
  }
  return postForm("/v1/audio/transcriptions", input, form, "audio.transcriptions.create", 60000);
}
