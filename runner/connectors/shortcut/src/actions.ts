import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const maxUploadBytes = 18 * 1024 * 1024;

type UploadFile = {
  fileName: string;
  contentBase64: string;
  contentType?: string;
};

type UploadInput = {
  apiKey: string;
  files: UploadFile[];
  story_id?: number;
  fetch?: typeof fetch;
};

export async function uploadFiles(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validateInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)["files.upload"];
  const client = createConnectorHttpClient({
    allowedHosts: (manifest.network as { allowedHosts: string[] }).allowedHosts,
    maxResponseBytes: operation?.maxResponseBytes ?? 1048576,
    timeoutMs: operation?.timeoutMs ?? 60000,
    fetch: input.fetch,
  });

  const form = new FormData();
  if (input.story_id !== undefined) {
    form.append("story_id", String(input.story_id));
  }
  for (const [index, file] of input.files.entries()) {
    const bytes = decodeBase64(file.contentBase64);
    form.append(
      `file${index}`,
      new Blob([bytes], { type: file.contentType ?? "application/octet-stream" }),
      file.fileName,
    );
  }

  return client.fetchText(new URL("https://api.app.shortcut.com/api/v3/files"), {
    method: "POST",
    headers: {
      "Shortcut-Token": input.apiKey,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => {
    if (response.status === 429) {
      throw {
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        message: "Shortcut rate limit exceeded while uploading files.",
        retryAfterSeconds: retryAfterSeconds(response.headers),
      };
    }
    if (response.status < 200 || response.status >= 300) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: `Shortcut rejected the file upload (HTTP ${response.status}).`,
      };
    }
    return {
      connector: "shortcut",
      action: "files.upload",
      source: "connector",
      files: parseResponse(response.body),
    };
  });
}

function validateInput(value: unknown): UploadInput {
  if (!isRecord(value)) return invalidInput();
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput();
  if (value.story_id !== undefined && (!Number.isInteger(value.story_id) || (value.story_id as number) < 1)) {
    return invalidInput();
  }
  if (!Array.isArray(value.files) || value.files.length === 0 || value.files.length > 4) {
    return invalidInput();
  }

  let totalBytes = 0;
  const files: UploadFile[] = [];
  for (const item of value.files) {
    if (!isRecord(item)
      || typeof item.fileName !== "string"
      || item.fileName.length === 0
      || item.fileName.length > 255
      || /[\u0000\r\n]/.test(item.fileName)
      || typeof item.contentBase64 !== "string") {
      return invalidInput();
    }
    if (item.contentType !== undefined
      && (typeof item.contentType !== "string"
        || item.contentType.length > 255
        || !/^[\w.+-]+\/[\w.+-]+(?:\s*;[^\r\n]*)?$/.test(item.contentType))) {
      return invalidInput();
    }
    const bytes = decodeBase64(item.contentBase64);
    totalBytes += bytes.byteLength;
    if (totalBytes > maxUploadBytes) return invalidInput();
    files.push({
      fileName: item.fileName,
      contentBase64: item.contentBase64,
      contentType: typeof item.contentType === "string" ? item.contentType : undefined,
    });
  }

  return {
    apiKey: value.apiKey,
    files,
    story_id: typeof value.story_id === "number" ? value.story_id : undefined,
    fetch: typeof value.fetch === "function" ? value.fetch as typeof fetch : undefined,
  };
}

function decodeBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return invalidInput();
  }
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (btoa(binary) !== value) return invalidInput();
    return bytes;
  } catch {
    return invalidInput();
  }
}

function parseResponse(body: string): unknown {
  if (body.length === 0) return [];
  try {
    return JSON.parse(body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Shortcut returned invalid JSON." };
  }
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  return 30;
}

function invalidInput(): never {
  throw {
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message: "Provide one to four valid base64 files (18 MB total maximum) and an optional story_id.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
