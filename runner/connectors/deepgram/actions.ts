import { ConnectorHttpError, hostIsAllowed } from "../../bun/src/http";
import manifest from "./manifest.json";

type FetchFn = typeof fetch;

const allowedHosts = ["api.deepgram.com"];
const speakUrl = "https://api.deepgram.com/v1/speak";
const successStatuses = new Set([200, 201]);

type SpeakInput = {
  apiKey: string;
  text: string;
  model?: string;
  encoding?: string;
  container?: string;
  sample_rate?: number;
  pitch?: number;
  speed?: number;
  voice?: string;
  version?: string;
  language?: string;
  fetch?: FetchFn;
};

export async function generateSpeech(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validateSpeakInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[
    "speak.generate"
  ];
  const timeoutMs = operation?.timeoutMs ?? 30000;
  const maxResponseBytes = operation?.maxResponseBytes ?? 5242880;

  const url = new URL(speakUrl);
  if (input.model) url.searchParams.set("model", input.model);
  if (input.encoding) url.searchParams.set("encoding", input.encoding);
  if (input.container) url.searchParams.set("container", input.container);
  if (input.sample_rate !== undefined) url.searchParams.set("sample_rate", String(input.sample_rate));
  if (!hostIsAllowed(url.hostname, allowedHosts)) {
    throw {
      ok: false,
      code: "OUTBOUND_HOST_NOT_ALLOWED",
      message: "Outbound host is not allowed for this connector.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new ConnectorHttpError("OUTBOUND_TIMEOUT", "Outbound request exceeded the connector HTTP timeout."),
    );
  }, timeoutMs);

  try {
    const fetchImpl = input.fetch ?? fetch;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${input.apiKey}`,
        Accept: acceptFor(input.encoding, input.container),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.text }),
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw {
        ok: false,
        code: "OUTBOUND_REDIRECT_BLOCKED",
        message: "Outbound redirects are blocked by the connector HTTP boundary.",
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxResponseBytes) {
      throw {
        ok: false,
        code: "OUTBOUND_RESPONSE_TOO_LARGE",
        message: "Outbound response exceeded the configured byte limit.",
      };
    }
    if (response.status === 429) {
      throw {
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        message: "Deepgram rate limit exceeded.",
      };
    }
    if (!successStatuses.has(response.status)) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: upstreamMessage(bytes, response.status),
      };
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return {
      connector: "deepgram",
      action: "speak.generate",
      source: "provider",
      data: {
        content_type: contentType,
        byte_length: bytes.byteLength,
        audio_base64: Buffer.from(bytes).toString("base64"),
      },
    };
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof ConnectorHttpError) {
      throw { ok: false, code: controller.signal.reason.code, message: controller.signal.reason.message };
    }
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function acceptFor(encoding?: string, container?: string): string {
  const format = `${encoding ?? ""} ${container ?? ""}`.toLowerCase();
  if (format.includes("mp3") || format.includes("mpeg")) return "audio/mpeg";
  if (format.includes("wav") || format.includes("linear16")) return "audio/wav";
  if (format.includes("ogg") || format.includes("opus")) return "audio/ogg";
  if (format.includes("flac")) return "audio/flac";
  return "audio/*";
}

function validateSpeakInput(value: unknown): SpeakInput {
  if (!isRecord(value)) return invalidInput("text is required");
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput("apiKey is required");
  if (typeof value.text !== "string" || value.text.length === 0) return invalidInput("text is required");
  if (value.model !== undefined && (typeof value.model !== "string" || value.model.length === 0)) {
    return invalidInput("model has an invalid type");
  }
  if (value.encoding !== undefined && (typeof value.encoding !== "string" || value.encoding.length === 0)) {
    return invalidInput("encoding has an invalid type");
  }
  if (value.container !== undefined && (typeof value.container !== "string" || value.container.length === 0)) {
    return invalidInput("container has an invalid type");
  }
  if (value.voice !== undefined && (typeof value.voice !== "string" || value.voice.length === 0)) {
    return invalidInput("voice has an invalid type");
  }
  if (value.version !== undefined && (typeof value.version !== "string" || value.version.length === 0)) {
    return invalidInput("version has an invalid type");
  }
  if (value.language !== undefined && (typeof value.language !== "string" || value.language.length === 0)) {
    return invalidInput("language has an invalid type");
  }
  if (value.sample_rate !== undefined && (!Number.isSafeInteger(value.sample_rate) || value.sample_rate < 8000 || value.sample_rate > 48000)) {
    return invalidInput("sample_rate is outside the allowed range");
  }
  if (value.pitch !== undefined && (typeof value.pitch !== "number" || !Number.isFinite(value.pitch) || value.pitch < 0.5 || value.pitch > 2)) {
    return invalidInput("pitch is outside the allowed range");
  }
  if (value.speed !== undefined && (typeof value.speed !== "number" || !Number.isFinite(value.speed) || value.speed < 0.25 || value.speed > 4)) {
    return invalidInput("speed is outside the allowed range");
  }
  return {
    apiKey: value.apiKey,
    text: value.text,
    model: typeof value.model === "string" ? value.model : undefined,
    encoding: typeof value.encoding === "string" ? value.encoding : undefined,
    container: typeof value.container === "string" ? value.container : undefined,
    sample_rate: typeof value.sample_rate === "number" ? value.sample_rate : undefined,
    pitch: typeof value.pitch === "number" ? value.pitch : undefined,
    speed: typeof value.speed === "number" ? value.speed : undefined,
    voice: typeof value.voice === "string" ? value.voice : undefined,
    version: typeof value.version === "string" ? value.version : undefined,
    language: typeof value.language === "string" ? value.language : undefined,
    fetch: typeof value.fetch === "function" ? (value.fetch as FetchFn) : undefined,
  };
}

function upstreamMessage(bytes: Uint8Array, status: number): string {
  const text = new TextDecoder().decode(bytes);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of ["err_msg", "message", "error", "detail"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  } catch {
    // Binary or non-JSON error bodies still surface as an upstream failure.
  }
  return `Deepgram rejected the speak request (HTTP ${status}).`;
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
