import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import type { JSONSchema } from "../../../bun/src/declarative/validate";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<
  string,
  { inputSchema?: JSONSchema; timeoutMs?: number }
>;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ALLOWED_HOST = "api.reply.io";
const credentialKeys = new Set(["apiKey", "fetch"]);

type FetchFn = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Handlers return only their declared output; the runner owns the envelope.
function output(data: unknown): Record<string, unknown> {
  return { data };
}

function fail(code: string, message: string): never {
  throw { ok: false, code, message };
}

function validate(operationKey: string, input: unknown): Record<string, unknown> {
  const schema = operations[operationKey]?.inputSchema ?? { type: "object" };
  try {
    return validateStrictInput(input, schema, credentialKeys);
  } catch (error) {
    fail("INVALID_ACTION_INPUT", error instanceof Error ? error.message : "Action input is invalid.");
  }
}

function encodeCrockford16(bytes: Uint8Array): string {
  if (bytes.length !== 16) fail("CONNECTOR_RESPONSE_INVALID", "ULID payload must be 16 bytes.");
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let index = 0; index < 26; index++) {
    out = CROCKFORD[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}

async function generateUlid(input: unknown): Promise<Record<string, unknown>> {
  const record = isRecord(input) ? input : {};
  const validated = validate("ulid.generate", record);
  const seed = validated.seed;
  let bytes: Uint8Array;
  if (typeof seed === "string" && seed.length > 0) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`reply-io:ulid:${seed}`)),
    );
    bytes = digest.subarray(0, 16);
  } else {
    bytes = new Uint8Array(16);
    let time = Date.now();
    for (let index = 5; index >= 0; index--) {
      bytes[index] = time & 0xff;
      time = Math.floor(time / 256);
    }
    crypto.getRandomValues(bytes.subarray(6));
  }
  return output({ ulid: encodeCrockford16(bytes) });
}

async function captureOAuthRedirect(
  operationKey: string,
  path: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const record = isRecord(input) ? input : {};
  validate(operationKey, record);
  const apiKey = record.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    fail("INVALID_ACTION_INPUT", "apiKey is required");
  }
  const url = new URL(path, "https://api.reply.io");
  if (url.hostname !== ALLOWED_HOST) {
    fail("OUTBOUND_HOST_NOT_ALLOWED", "Outbound host is not allowed for this connector.");
  }
  const fetchImpl: FetchFn = typeof record.fetch === "function" ? (record.fetch as FetchFn) : fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      redirect: "manual",
    });
  } catch {
    fail("CONNECTOR_UNAVAILABLE", "Connector request failed.");
  }
  if (response.status !== 302) {
    let message = "Reply.io OAuth start failed.";
    try {
      const body = JSON.parse(await response.text()) as Record<string, unknown>;
      for (const key of ["detail", "title", "message"]) {
        if (typeof body[key] === "string" && body[key]) {
          message = String(body[key]);
          break;
        }
      }
    } catch {
      // Empty 401 bodies are official.
    }
    fail("CONNECTOR_UPSTREAM_ERROR", message);
  }
  const location = response.headers.get("location");
  if (!location) fail("CONNECTOR_RESPONSE_INVALID", "OAuth redirect is missing Location.");
  return output({ location });
}

export const actions = {
  ...compiled.actions,
  "email_accounts.connect_gmail": (input: unknown) =>
    captureOAuthRedirect("email_accounts.connect_gmail", "/v3/email-accounts/connect/gmail", input),
  "email_accounts.connect_office365": (input: unknown) =>
    captureOAuthRedirect(
      "email_accounts.connect_office365",
      "/v3/email-accounts/connect/office-365",
      input,
    ),
  "ulid.generate": generateUlid,
};

export { encodeCrockford16 };
