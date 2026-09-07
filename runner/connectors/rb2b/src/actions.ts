import { isRecord } from "./http";
import { parseVisitorWebhook } from "./objects";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── visitors.parse ───────────────────────────────────────────────────────────

export type VisitorsParseInput = { payload: Record<string, unknown>; apiKey?: string; fetch?: typeof fetch };

export function validateVisitorsParseInput(input: unknown): VisitorsParseInput {
  if (!isRecord(input)) throw new Error("visitors.parse input must be an object");
  if (!isRecord(input.payload)) throw new Error("payload is required and must be an object");
  return { payload: input.payload as Record<string, unknown> };
}

export function parseVisitors(input: unknown): Record<string, unknown> {
  // This action is pure normalization — no network call regardless of apiKey presence.
  // The dual-mode pattern: if apiKey is present and valid, still just normalize
  // (there is no remote endpoint for this action).
  const validated = validateVisitorsParseInput(input);
  const visitor = parseVisitorWebhook(validated.payload);
  return {
    connector: "rb2b",
    action: "visitors.parse",
    source: "connector",
    visitor,
  };
}

// ─── healthcheck ──────────────────────────────────────────────────────────────

export type HealthcheckInput = { apiKey?: string; fetch?: typeof fetch };

export function validateHealthcheckInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("healthcheck input must be an object");
  return {};
}

export function getHealthcheck(input: unknown): Record<string, unknown> {
  // Dual-mode: with or without apiKey, healthcheck is always local
  validateHealthcheckInput(input);
  return { connector: "rb2b", action: "healthcheck", source: "connector", status: "ok" };
}
