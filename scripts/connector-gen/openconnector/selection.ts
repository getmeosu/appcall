export const PINNED_UPSTREAM_SHA = "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a";

export type Decision = "ADMIT" | "HOLD" | "EXCLUDE";
export type BreachStatus = "none-found" | "confirmed" | "unresolved" | "unsupported-allegation";
export type SelectionEntry = {
  providerId: string;
  appcallId: string;
  disposition: "APPROVED" | "HOLD" | "EXCLUDE";
  edition: string;
  operations: string[];
  upstreamSha: string;
  marketFocus: "international" | "mainland-china" | "unknown";
  ownership?: string;
  aliases?: string[];
  research?: { reviewedAt: string; reviewer: string; sources: string[]; searchCoverage: string };
  breach?: { status: BreachStatus; researchedAt: string };
  exception?: { kind: "tiktok" | "popular" | "other"; authority: string; productIds?: string[]; operationIds?: string[]; adoption?: string; usefulness?: string; incident?: string; remediation?: string; residualRisk?: string };
  quality?: { usefulness: number; api: number; auth: number; maintainability: number; testability: number };
  gates?: { license: boolean; credentials: boolean; officialApi: boolean; boundedNetwork: boolean; operationQuality: boolean };
};
export type SelectionRegistry = { entries: SelectionEntry[] };
export type SelectionRequest = { providerId: string; edition: string; operationId: string; upstreamSha: string; asOf: string };
export type SelectionResult = { decision: Decision; providerId: string; edition: string; operationId: string; reasons: string[] };

const result = (request: SelectionRequest, decision: Decision, reasons: string[]): SelectionResult => ({ ...request, decision, reasons });
const validDate = (s: unknown, asOf?: string) => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s) && (!asOf || s <= asOf); };

export function decideSelection(registry: SelectionRegistry, request: SelectionRequest): SelectionResult {
  if (!registry || !Array.isArray(registry.entries) || !request?.providerId || !request.edition || !request.operationId || !validDate(request.asOf)) return result(request, "HOLD", ["malformed selection request or registry"]);
  if (request.upstreamSha !== PINNED_UPSTREAM_SHA) return result(request, "HOLD", ["upstream revision is not the pinned revision"]);
  const aliasOwners = new Map<string, string>();
  if (registry.entries.some((entry) => !entry || typeof entry !== "object")) return result(request, "HOLD", ["malformed registry entry"]);
  if (registry.entries.some((entry) => typeof entry.providerId !== "string" || !entry.providerId || typeof entry.appcallId !== "string" || !entry.appcallId || (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || entry.aliases.some((a) => typeof a !== "string" || !a))))) return result(request, "HOLD", ["malformed provider identity or aliases"]);
  for (const [index, entry] of registry.entries.entries()) {
    for (const alias of [entry.providerId, entry.appcallId, ...(entry.aliases ?? [])]) {
      const owner = aliasOwners.get(alias);
      if (owner && owner !== String(index)) return result(request, "HOLD", [`duplicate provider alias: ${alias}`]);
      aliasOwners.set(alias, String(index));
    }
  }
  if (registry.entries.some((e, i) => registry.entries.findIndex((x) => x.providerId === e.providerId && x.edition === e.edition) !== i)) return result(request, "HOLD", ["duplicate provider edition entries"]);
  const entry = registry.entries.find((candidate) => candidate.providerId === request.providerId && candidate.edition === request.edition);
  if (!entry) return result(request, "HOLD", ["provider edition is not explicitly selected"]);
  if (entry.edition === "mainland-china" || entry.marketFocus === "mainland-china") return result(request, "EXCLUDE", ["mainland-China-focused edition"]);
  if (entry.disposition === "EXCLUDE") return result(request, "EXCLUDE", ["entry is explicitly excluded"]);
  if (entry.upstreamSha !== PINNED_UPSTREAM_SHA || entry.disposition !== "APPROVED") return result(request, "HOLD", ["entry is not explicitly approved or is malformed"]);
  if (entry.marketFocus !== "international") return result(request, "HOLD", ["market focus is unknown or inadequately evidenced"]);
  if (!entry.research || !validDate(entry.research.reviewedAt, request.asOf) || !entry.research.reviewer || !entry.research.searchCoverage || !Array.isArray(entry.research.sources) || entry.research.sources.length === 0 || !entry.research.sources.every((s) => typeof s === "string" && /^https?:\/\//.test(s))) return result(request, "HOLD", ["missing or malformed dated research evidence"]);
  if (!entry.breach || !["none-found", "confirmed", "unresolved", "unsupported-allegation"].includes(entry.breach.status) || !validDate(entry.breach.researchedAt, request.asOf)) return result(request, "HOLD", ["missing or malformed dated breach research"]);
  if (entry.breach.status === "unresolved") return result(request, "HOLD", ["unresolved compromise requires investigation"]);
  if (entry.breach.status === "confirmed" && !validException(entry, request.operationId)) return result(request, "EXCLUDE", ["confirmed qualifying breach without valid exact exception"]);
  if (!Array.isArray(entry.operations) || !entry.operations.includes(request.operationId)) return result(request, "HOLD", ["operation is not explicitly allowlisted"]);
  if (!entry.quality || !exactKeys(entry.quality, ["usefulness", "api", "auth", "maintainability", "testability"]) || Object.values(entry.quality).some((score) => !Number.isFinite(score) || score < 3 || score > 5) || weighted(entry.quality) < 4) return result(request, "HOLD", ["quality score is below admission threshold"]);
  if (!entry.gates || !exactKeys(entry.gates, ["license", "credentials", "officialApi", "boundedNetwork", "operationQuality"]) || Object.values(entry.gates).some((gate) => gate !== true)) return result(request, "HOLD", ["required license, credential, API, network or operation gate is unproven"]);
  return result(request, "ADMIT", ["all strict eligibility and execution gates passed"]);
}

function weighted(q: NonNullable<SelectionEntry["quality"]>) {
  return q.usefulness * .3 + q.api * .2 + q.auth * .2 + q.maintainability * .15 + q.testability * .15;
}
function exactKeys(value: object, keys: string[]) { const actual = Object.keys(value); return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)); }
function validException(entry: SelectionEntry, operationId: string) {
  const x = entry.exception;
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((id) => text(id));
  if (!x || !text(x.authority) || !text(x.adoption) || !text(x.usefulness) || !text(x.incident) || !text(x.remediation) || !text(x.residualRisk) || !ids(x.operationIds) || !x.operationIds.includes(operationId) || !ids(x.productIds)) return false;
  if (x.kind === "tiktok") return entry.providerId === "tiktok_business" && entry.appcallId === "tiktok-ads" && entry.edition === "international" && x.productIds.includes("tiktok_business");
  return x.kind === "other" && x.productIds.includes(entry.providerId);
}
