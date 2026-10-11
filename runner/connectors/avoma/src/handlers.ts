import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const allowedHosts = manifest.network.allowedHosts as string[];
const analysisOp = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[
  "meetings.analysis.get"
];

type FetchFn = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function parseBody(body: string): unknown {
  if (body.trim() === "") return null;
  try {
    return JSON.parse(body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 30;
  return Math.min(Math.floor(parsed), 3600);
}

function failStatus(
  status: number,
  headers: Record<string, string>,
  parsed: unknown,
  fallback: string,
): never {
  if (status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Avoma rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(headers),
    };
  }
  const detail =
    isRecord(parsed) && typeof parsed.detail === "string"
      ? parsed.detail
      : isRecord(parsed) && typeof parsed.message === "string"
        ? parsed.message
        : isRecord(parsed) && typeof parsed.error === "string"
          ? parsed.error
          : undefined;
  throw {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: detail ?? fallback,
  };
}

async function getJson(
  fetchImpl: FetchFn | undefined,
  apiKey: string,
  url: URL,
): Promise<unknown> {
  const client = createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes: analysisOp?.maxResponseBytes ?? 5242880,
    timeoutMs: analysisOp?.timeoutMs ?? 15000,
    fetch: fetchImpl,
  });
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  const parsed = parseBody(response.body);
  if (response.status < 200 || response.status >= 300) {
    failStatus(response.status, response.headers, parsed, `Avoma rejected the meetings.analysis.get request (HTTP ${response.status}).`);
  }
  return parsed;
}

export function getMeetingAnalysis(inputValue: unknown): unknown {
  if (!isRecord(inputValue)) invalidInput("meeting_uuid is required");
  const apiKey = inputValue.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) invalidInput("meeting_uuid is required");
  const meetingUuid = inputValue.meeting_uuid;
  if (typeof meetingUuid !== "string" || meetingUuid.length === 0) invalidInput("meeting_uuid is required");
  for (const key of Object.keys(inputValue)) {
    if (key !== "meeting_uuid" && key !== "apiKey" && key !== "fetch") {
      invalidInput("Unsupported input field");
    }
  }

  const encoded = encodeURIComponent(meetingUuid);
  const fetchImpl = typeof inputValue.fetch === "function" ? (inputValue.fetch as FetchFn) : undefined;

  return (async () => {
    const insights = await getJson(fetchImpl, apiKey, new URL(`https://api.avoma.com/v1/meetings/${encoded}/insights/`));
    const segments = await getJson(fetchImpl, apiKey, new URL(`https://api.avoma.com/v1/meeting_segments/?uuid=${encoded}`));
    const sentiments = await getJson(fetchImpl, apiKey, new URL(`https://api.avoma.com/v1/meeting_sentiments/?meeting_uuid=${encoded}`));
    return {
      connector: "avoma",
      action: "meetings.analysis.get",
      source: "provider",
      data: { insights, segments, sentiments },
    };
  })();
}
