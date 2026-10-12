import { assertSafePathSegment } from "../../_shared/jobboard";

// FIX-SEGMENT: the one place the github connector validates caller input that is
// interpolated into a REST path. It replaces ~45 local copies (requireSingleSegment /
// segment) that only blocked "/", "?" and "#", so "." and ".." got through and, once
// interpolated, collapse the path (RFC 3986 §5.2.4 dot segments).
//
// SEC-PATH-1 (PR #628) adds dot-segment rejection to the shared assertSafePathSegment,
// but this base does not have it yet, so the dot checks below are self-contained and
// do not depend on #628's merge order. Values inside the shared helper's strict charset
// are also passed through assertSafePathSegment so any later tightening there applies.
// _shared/jobboard.ts itself is not modified here.

const SHARED_CHARSET = /^[A-Za-z0-9._-]+$/;

/**
 * True for a dot segment: only "." characters, including percent-encoded "%2e" forms
 * (the WHATWG URL parser treats "%2e%2e" and ".%2e" as ".." when a value reaches the
 * path unencoded).
 */
export function isDotSegment(text: string): boolean {
  return /^(?:\.|%2e)+$/i.test(text);
}

/**
 * A single REST path segment (owner, repo, org, username, label name, secret name ...).
 * Same messages as the copies it replaces; additionally rejects "\" (a path separator
 * for https URLs) and dot segments. Throws before any HTTP call.
 */
export function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#") || value.includes("\\")) {
    throw new Error(`${field} must be a single path segment`);
  }
  if (isDotSegment(value)) throw new Error(`${field} must not be a dot segment`);
  if (SHARED_CHARSET.test(value)) assertSafePathSegment(value, field);
  return value;
}

/**
 * Throws when any "/"-separated component of a slash-allowed value (branch names,
 * environment names, package names) is a dot segment or contains "\". Empty components
 * keep their current (accepted) behavior.
 */
export function rejectDotComponents(value: string, field: string): string {
  if (value.includes("\\")) throw new Error(`${field} must not contain a backslash`);
  for (const component of value.split("/")) {
    if (component.length > 0 && isDotSegment(component)) {
      throw new Error(`${field} must not contain "." or ".." path segments`);
    }
  }
  return value;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * FIX-SEGMENT amend: the request-path choke point. Every GitHub request path (fetchJSON and
 * the hand-built api/uploads URLs) passes through here after interpolation, so a value that
 * never met requireSingleSegment still cannot reshape the route. Rejects, before any fetch:
 * - a raw "\" (the WHATWG parser turns it into "/" for https URLs);
 * - an empty segment ("//", or a trailing "/" from an empty value);
 * - a segment that is "." / ".." / all dots, raw or percent-encoded (%2e, %2E.);
 * - a segment that is whitespace only once decoded;
 * - a segment whose decoded value contains "\", or a "/"-separated component that is a dot
 *   segment (an encoded "a%2F..%2Fb" or "a%2F%252e%252e%2Fb").
 * Valid paths are returned unchanged, so requests stay byte-identical.
 */
export function assertSafeRequestPath(pathOrUrl: string): string {
  const withoutOrigin = pathOrUrl.replace(/^https?:\/\/[^/?#]*/i, "");
  const path = withoutOrigin.split(/[?#]/, 1)[0] ?? "";
  const reject = (reason: string, segment: string): never => {
    throw new Error(
      `GitHub request path ${reason} (${JSON.stringify(segment)}); path parameters must not be empty, whitespace, "." or ".." (including %2e forms) or contain a backslash.`,
    );
  };
  if (path.includes("\\")) reject("contains a backslash", path);
  // The API root "/" (e.g. GET /) is the one path allowed an empty segment.
  const segments = path === "/" ? [] : path.split("/").slice(1);
  for (const segment of segments) {
    if (segment.length === 0) reject("has an empty segment", path);
    if (isDotSegment(segment)) reject("has a dot segment", segment);
    const decoded = safeDecode(segment);
    if (decoded.trim().length === 0) reject("has a blank segment", segment);
    if (decoded.includes("\\")) reject("contains a backslash", segment);
    for (const component of decoded.split("/")) {
      if (component.length > 0 && isDotSegment(component)) reject("has a dot segment", segment);
    }
  }
  return pathOrUrl;
}

/**
 * A slash-allowed ref/path value that is embedded inside one URL segment (the compare
 * "base...head" pair): not blank, no "\\", no "."/".."/all-dot component (incl. %2e forms).
 */
export function requireRefComponents(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return rejectDotComponents(value, field);
}
