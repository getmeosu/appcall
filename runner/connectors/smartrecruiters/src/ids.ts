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

export function withJobPrefix(rawId: string): string {
  return rawId.startsWith("sr-job:") ? rawId : `sr-job:${rawId}`;
}
