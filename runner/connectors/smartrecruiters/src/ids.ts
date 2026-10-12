/**
 * SmartRecruiters id helpers.
 *
 * Sync normalizers emit prefixed ids (`sr-job:`, `sr-candidate:`, `sr-interview:`,
 * `sr-user:`). Path, query and body inputs accept both the raw upstream id and
 * that prefixed form and send the raw id. Path segments use the *IdSegment
 * helpers (prefix strip + assertSafePathSegment); query/body fields use the
 * *IdValue helpers (same strip and id validation, no path guard).
 */
import { assertSafePathSegment } from "../../_shared/jobboard";

function stripIdPrefix(value: unknown, field: string, prefixes: readonly string[]): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  let v = value.trim();
  for (const prefix of prefixes) {
    if (v.startsWith(prefix)) {
      v = v.slice(prefix.length);
      break;
    }
  }
  return v;
}

/** Path variant: strips one prefix, then runs the SEC-PATH guard (assertSafePathSegment). */
export function stripPrefixedId(value: unknown, field: string, prefixes: readonly string[]): string {
  return assertSafePathSegment(stripIdPrefix(value, field, prefixes), field);
}

/**
 * Non-path variant (SR-ID-1) for query and body fields: strips one prefix and
 * rejects an invalid id exactly as the path helpers do (required, id charset,
 * dot-only), with the same messages, but never calls the SEC-PATH guard: the
 * value is a query parameter or JSON field, not a path segment. SmartRecruiters
 * ids are UUID/hex, so a dot-only value is an invalid id either way.
 */
export function prefixedIdValue(value: unknown, field: string, prefixes: readonly string[]): string {
  const v = stripIdPrefix(value, field, prefixes);
  if (v.length === 0) throw new Error(`${field} is required`);
  if (!/^[A-Za-z0-9._-]+$/.test(v)) {
    throw new Error(`${field} may only contain letters, digits, dots, underscores and hyphens`);
  }
  if (/^\.+$/.test(v)) throw new Error(`${field} must not be a dot segment`);
  return v;
}

/** Job id for a query/body field: raw or `sr-job:`-prefixed, sent raw. */
export function jobIdValue(value: unknown, field = "jobId"): string {
  return prefixedIdValue(value, field, ["sr-job:"]);
}

/** Candidate id for a query/body field: raw or `sr-candidate:`-prefixed, sent raw. */
export function candidateIdValue(value: unknown, field = "candidateId"): string {
  return prefixedIdValue(value, field, ["sr-candidate:"]);
}

/** User id for a query/body field: raw or `sr-user:`-prefixed (users.list form), sent raw. */
export function userIdValue(value: unknown, field = "userId"): string {
  return prefixedIdValue(value, field, ["sr-user:"]);
}

/** Job id for path/query: accepts raw or `sr-job:`-prefixed. */
export function jobIdSegment(value: unknown, field = "id"): string {
  return stripPrefixedId(value, field, ["sr-job:"]);
}

/** Candidate id for path/query: accepts raw or `sr-candidate:`-prefixed. */
export function candidateIdSegment(value: unknown, field = "id"): string {
  return stripPrefixedId(value, field, ["sr-candidate:"]);
}

/** User id for path/body: accepts raw or `sr-user:`-prefixed. */
export function userIdSegment(value: unknown, field = "userId"): string {
  return stripPrefixedId(value, field, ["sr-user:"]);
}

/** Interview id for path: accepts raw or `sr-interview:`-prefixed (interviews.list form). */
export function interviewIdSegment(value: unknown, field = "interviewId"): string {
  return stripPrefixedId(value, field, ["sr-interview:"]);
}

function withPrefix(prefix: string, rawId: string): string {
  return rawId.startsWith(prefix) ? rawId : `${prefix}${rawId}`;
}

export function withJobPrefix(rawId: string): string {
  return withPrefix("sr-job:", rawId);
}

export function withCandidatePrefix(rawId: string): string {
  return withPrefix("sr-candidate:", rawId);
}

export function withUserPrefix(rawId: string): string {
  return withPrefix("sr-user:", rawId);
}

export function withInterviewPrefix(rawId: string): string {
  return withPrefix("sr-interview:", rawId);
}
