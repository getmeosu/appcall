import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import type { CompiledHandler } from "../../../bun/src/declarative/types";

const PROFILE_ALIASES = ["profileId", "profile", "profile_id", "config", "config_id"] as const;
const FROM_ALIASES = ["from", "from_date"] as const;
const TO_ALIASES = ["to", "to_date"] as const;

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function normalizeNextDnsInput(operation: string, input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const record = { ...(input as Record<string, unknown>) };
  const profile = firstString(record, PROFILE_ALIASES);
  if (profile !== undefined) {
    for (const key of PROFILE_ALIASES) {
      if (record[key] === undefined) record[key] = profile;
    }
  }
  const from = firstString(record, FROM_ALIASES);
  if (from !== undefined) {
    for (const key of FROM_ALIASES) {
      if (record[key] === undefined) record[key] = from;
    }
  }
  const to = firstString(record, TO_ALIASES);
  if (to !== undefined) {
    for (const key of TO_ALIASES) {
      if (record[key] === undefined) record[key] = to;
    }
  }
  if (operation === "settings.logs.client_ips" && typeof record.enable === "boolean" && record.drop_ip === undefined) {
    record.drop_ip = !record.enable;
  }
  if (operation === "settings.logs.domains" && typeof record.enabled === "boolean" && record.drop_domain === undefined) {
    record.drop_domain = !record.enabled;
  }
  return record;
}

const compiled = compileDeclarativeConnector(manifest as never);

export const actions: Record<string, CompiledHandler> = Object.fromEntries(
  Object.entries(compiled.actions).map(([key, handler]) => [
    key,
    (input: unknown) => handler(normalizeNextDnsInput(key, input)),
  ]),
);
