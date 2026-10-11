/**
 * SmartRecruiters id helpers.
 *
 * Sync normalizers emit prefixed ids (`sr-job:`, `sr-candidate:`, `sr-interview:`,
 * `sr-user:`). Path/query inputs must accept both the raw upstream id and that
 * prefixed form, stripping a single leading prefix before assertSafePathSegment
 * (which rejects `:`).
 */
import { assertSafePathSegment } from "../../_shared/jobboard";

export function stripPrefixedId(value: unknown, field: string, prefixes: readonly string[]): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  let v = value.trim();
  for (const prefix of prefixes) {
    if (v.startsWith(prefix)) {
      v = v.slice(prefix.length);
      break;
    }
  }
  return assertSafePathSegment(v, field);
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
