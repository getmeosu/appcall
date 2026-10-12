import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const maxUploadBytes = 18 * 1024 * 1024;

type FileInput = {
  name: string;
  contentType?: string;
  contentBase64: string;
};

type UploadInput = {
  apiKey: string;
  campaign: string;
  folderUuid: string;
  file: FileInput;
  fetch?: typeof fetch;
};

export function uploadCampaignMedia(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)["campaigns.media.upload"];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation?.maxResponseBytes ?? 1048576,
    timeoutMs: operation?.timeoutMs ?? 60000,
    fetch: input.fetch,
  });

  const url = new URL(`https://api.raisely.com/v3/campaigns/${encodeURIComponent(input.campaign)}/media/${encodeURIComponent(input.folderUuid)}`);
  const bytes = decodeBase64(input.file.contentBase64);
  const form = new FormData();
  form.append("filename", new Blob([bytes], { type: input.file.contentType ?? "application/octet-stream" }), input.file.name);

  return client.fetchText(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => {
    const data = parseResponse(response.body);
    if (response.status === 429) {
      throw {
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        message: "Raisely rate limit exceeded while uploading media.",
        retryAfterSeconds: retryAfterSeconds(response.headers),
      };
    }
    if (response.status < 200 || response.status >= 300) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: `Raisely rejected the media upload (HTTP ${response.status}).`,
      };
    }
    return { data };
  });
}

function validateInput(value: unknown): UploadInput {
  if (!isRecord(value)) return invalidInput();
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput();
  if (typeof value.campaign !== "string" || value.campaign.length === 0) return invalidInput();
  const folder = typeof value.folder_uuid === "string" ? value.folder_uuid : typeof value.folderUuid === "string" ? value.folderUuid : "";
  if (folder.length === 0) return invalidInput();
  if (!isRecord(value.file)) return invalidInput();
  const name = typeof value.file.name === "string" && value.file.name.length > 0
    ? value.file.name
    : typeof value.file.filename === "string" && value.file.filename.length > 0
      ? value.file.filename
      : "";
  if (name.length === 0 || name.length > 255 || /[\u0000\r\n]/.test(name)) return invalidInput();
  const contentBase64 = typeof value.file.contentBase64 === "string"
    ? value.file.contentBase64
    : typeof value.file.content === "string"
      ? value.file.content
      : "";
  if (contentBase64.length === 0) return invalidInput();
  const contentType = typeof value.file.contentType === "string"
    ? value.file.contentType
    : typeof value.file.mimeType === "string"
      ? value.file.mimeType
      : undefined;
  if (contentType !== undefined && (contentType.length > 255 || !/^[\w.+-]+\/[\w.+-]+(?:\s*;[^\r\n]*)?$/.test(contentType))) {
    return invalidInput();
  }
  const bytes = decodeBase64(contentBase64);
  if (bytes.byteLength > maxUploadBytes) return invalidInput();
  return {
    apiKey: value.apiKey,
    campaign: value.campaign,
    folderUuid: folder,
    file: { name, contentBase64, contentType },
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
    message: "Provide campaign, folder_uuid, and file.name with file.contentBase64 (18 MB maximum).",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
