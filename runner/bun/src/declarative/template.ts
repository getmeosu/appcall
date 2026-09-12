// Template rendering for declarative connector operations.
//
// A declarative operation describes its HTTP request as data, so every value
// that depends on the action input is written as a `{{path}}` placeholder.
// Rendering resolves those placeholders against a context object.
//
// Two substitution modes, chosen by shape rather than by a flag:
//   - whole-value: the string is exactly one placeholder ("{{ids}}") and the
//     resolved value keeps its original type (array, number, object, …).
//   - interpolated: the placeholder sits inside a larger string
//     ("Bearer {{apiKey}}") and the result is always a string.
//
// Unresolved is represented by `undefined` and propagates outward: an object
// key or array element that renders to `undefined` is dropped. That single rule
// replaces the `if (payload.x !== undefined) body.x = payload.x` chains every
// hand-written connector repeats.

const placeholderPattern = /\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g;
const wholeValuePattern = /^\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}$/;

export type TemplateContext = Record<string, unknown>;

export function renderTemplate(template: unknown, context: TemplateContext): unknown {
  if (typeof template === "string") {
    return renderString(template, context);
  }
  if (Array.isArray(template)) {
    const rendered = template
      .map((item) => renderTemplate(item, context))
      .filter((item) => item !== undefined);
    return rendered;
  }
  if (isRecord(template)) {
    const rendered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const resolved = renderTemplate(value, context);
      if (resolved !== undefined) {
        rendered[key] = resolved;
      }
    }
    return rendered;
  }
  return template;
}

// renderPath renders a URL path template. Path segments are structural — a
// missing one would silently retarget the request at a different resource — so
// an unresolved placeholder throws the same `<field> is required` error the
// hand-written validators raise, and resolved values are URL-encoded.
export function renderPath(path: string, context: TemplateContext): string {
  const renderedPath = path.replace(placeholderPattern, (match, expression: string, offset: number) => {
    const value = resolvePath(expression, context);
    if (value === undefined || value === null || value === "") {
      throw new Error(`${lastSegment(expression)} is required`);
    }
    const rendered = encodeURIComponent(String(value));
    assertSafePathSegment(path, offset, match.length, rendered);
    return rendered;
  });
  assertSafePathSegments(renderedPath);
  return renderedPath;
}

/** Reject substitutions that would make a complete URL path segment traversal token. */
export function assertSafePathSegment(path: string, offset: number, matchLength: number, value: string): void {
  const startsSegment = offset === 0 || path[offset - 1] === "/";
  const endsSegment = offset + matchLength === path.length || path[offset + matchLength] === "/";
  if (startsSegment && endsSegment && (value === "." || value === "..")) {
    throw new Error("dot path segment is not allowed");
  }
}

/** Reject both static and composed dot segments after all substitutions finish. */
export function assertSafePathSegments(path: string): void {
  if (path.split("/").some((segment) => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Leave malformed static escapes to the URL boundary; they are not a
      // dot segment after decoding and cannot be normalized as one.
    }
    return decoded === "." || decoded === "..";
  })) {
    throw new Error("dot path segment is not allowed");
  }
}

export function hasPlaceholder(template: unknown): boolean {
  if (typeof template === "string") {
    return wholeValuePattern.test(template) || newPattern().test(template);
  }
  if (Array.isArray(template)) {
    return template.some(hasPlaceholder);
  }
  if (isRecord(template)) {
    return Object.values(template).some(hasPlaceholder);
  }
  return false;
}

// resolvePath walks a dotted path ("user.name", "items.0.id") through nested
// records and arrays. Anything it cannot walk resolves to undefined.
export function resolvePath(expression: string, context: TemplateContext): unknown {
  let current: unknown = context;
  for (const segment of expression.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function renderString(template: string, context: TemplateContext): unknown {
  const whole = template.match(wholeValuePattern);
  if (whole) {
    const value = resolvePath(whole[1] as string, context);
    return value === null ? undefined : value;
  }

  const pattern = newPattern();
  if (!pattern.test(template)) {
    return template;
  }

  let unresolved = false;
  const interpolated = template.replace(newPattern(), (_match, expression: string) => {
    const value = resolvePath(expression, context);
    if (value === undefined || value === null) {
      unresolved = true;
      return "";
    }
    return String(value);
  });
  return unresolved ? undefined : interpolated;
}

// newPattern returns a fresh regex because the shared literal carries the `g`
// flag, and `lastIndex` on a shared instance makes `test` alternate.
function newPattern(): RegExp {
  return new RegExp(placeholderPattern.source, "g");
}

function lastSegment(expression: string): string {
  const segments = expression.split(".");
  return segments[segments.length - 1] ?? expression;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
