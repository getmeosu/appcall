import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const maxUploadBytes = 5 * 1024 * 1024;

type UploadInput = {
  apiKey: string;
  brandId: string;
  fileName: string;
  contentBase64: string;
  contentType?: string;
  fetch?: typeof fetch;
};

export function createSuppressionList(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)
    ["suppressionLists.create"];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 1048576,
    timeoutMs: operation.timeoutMs ?? 60000,
    fetch: input.fetch,
  });

  const url = new URL(
    `https://api.bigmailer.io/v1/brands/${encodeURIComponent(input.brandId)}/suppression-lists`,
  );
  const bytes = decodeBase64(input.contentBase64);
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: input.contentType ?? "text/csv" }),
    input.fileName,
  );

  return client.fetchText(url, {
    method: "POST",
    headers: {
      "X-API-Key": input.apiKey,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => {
    const data = parseResponse(response.body);
    if (response.status === 429) {
      throw {
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        message: "BigMailer rate limit exceeded while creating a suppression list.",
        retryAfterSeconds: retryAfterSeconds(response.headers),
      };
    }
    if (response.status < 200 || response.status >= 300) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: `BigMailer rejected the suppression list upload (HTTP ${response.status}).`,
      };
    }
    return { data };
  });
}

function validateInput(value: unknown): UploadInput {
  if (!isRecord(value)) return invalidInput();
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput();
  if (typeof value.brandId !== "string" || value.brandId.length === 0 || value.brandId.length > 256) {
    return invalidInput();
  }
  if (
    typeof value.fileName !== "string"
    || value.fileName.length === 0
    || value.fileName.length > 255
    || /[\u0000\r\n]/.test(value.fileName)
  ) {
    return invalidInput();
  }
  if (typeof value.contentBase64 !== "string") return invalidInput();
  if (
    value.contentType !== undefined
    && (typeof value.contentType !== "string"
      || value.contentType.length > 255
      || !/^[\w.+-]+\/[\w.+-]+(?:\s*;[^\r\n]*)?$/.test(value.contentType))
  ) {
    return invalidInput();
  }
  const bytes = decodeBase64(value.contentBase64);
  if (bytes.byteLength === 0 || bytes.byteLength > maxUploadBytes) return invalidInput();
  return {
    apiKey: value.apiKey,
    brandId: value.brandId,
    fileName: value.fileName,
    contentBase64: value.contentBase64,
    contentType: typeof value.contentType === "string" ? value.contentType : undefined,
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
  if (body.length === 0) return {};
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body.slice(0, 4096) };
  }
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const retryAfter = Number(headers["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  return 30;
}

function invalidInput(): never {
  throw {
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message: "Provide a brand ID and a valid base64 CSV file (5 MB maximum).",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
