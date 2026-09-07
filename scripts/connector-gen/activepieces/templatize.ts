// Recover a declarative request template from a recorded HTTP request.
//
// A piece action's `run` is arbitrary TypeScript: it may branch, rename fields,
// coerce types, and route through several layers of the piece's own helpers.
// Rather than parse it, the extractor executes it with each input set to a
// unique sentinel value and records the single request that comes out at the
// `@activepieces/pieces-common` boundary. Wherever a sentinel surfaces in the
// recorded URL, headers, or body, that position is where the input belongs — so
// substituting `{{name}}` back in reconstructs the template exactly, including
// the renames (`firstName` -> `first_name`) that a static transform would miss.
//
// Sentinels are typed because piece code does arithmetic and array access on
// its inputs. Booleans are the one shape with no traceable sentinel — `true` is
// indistinguishable from a literal — so an action carrying boolean inputs is
// reported as needing review rather than silently mis-templated.

export type Sentinels = Map<string, { name: string; value: unknown }>;

export const authSentinel = "__AP_AUTH__";

const numericBase = 900000001;

export function buildSentinels(schema: { properties: Record<string, Record<string, unknown>> }): {
  values: Record<string, unknown>;
  sentinels: Sentinels;
  untraceable: string[];
} {
  const values: Record<string, unknown> = {};
  const sentinels: Sentinels = new Map();
  const untraceable: string[] = [];
  let numericIndex = 0;

  for (const [name, property] of Object.entries(schema.properties)) {
    const token = `__AP_${name}__`;
    switch (property.type) {
      case "number": {
        const value = numericBase + numericIndex;
        numericIndex += 1;
        values[name] = value;
        sentinels.set(String(value), { name, value });
        break;
      }
      case "boolean": {
        values[name] = true;
        untraceable.push(name);
        break;
      }
      case "array": {
        values[name] = [token];
        sentinels.set(token, { name, value: [token] });
        break;
      }
      case "object": {
        values[name] = { [token]: token };
        sentinels.set(token, { name, value: { [token]: token } });
        break;
      }
      default: {
        values[name] = token;
        sentinels.set(token, { name, value: token });
      }
    }
  }

  return { values, sentinels, untraceable };
}

export function templatize(value: unknown, sentinels: Sentinels): unknown {
  if (typeof value === "string") {
    return templatizeString(value, sentinels);
  }
  if (typeof value === "number") {
    const hit = sentinels.get(String(value));
    return hit ? `{{${hit.name}}}` : value;
  }
  if (Array.isArray(value)) {
    // An array that is exactly one array-sentinel came straight from an array
    // input, so it maps to the whole placeholder rather than element by element.
    if (value.length === 1 && typeof value[0] === "string") {
      const hit = sentinels.get(value[0]);
      if (hit && Array.isArray(hit.value)) {
        return `{{${hit.name}}}`;
      }
    }
    return value.map((item) => templatize(item, sentinels));
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const hit = sentinels.get(keys[0]!);
      if (hit && isRecord(hit.value)) {
        return `{{${hit.name}}}`;
      }
    }
    const mapped: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      mapped[key] = templatize(item, sentinels);
    }
    return mapped;
  }
  return value;
}

function templatizeString(value: string, sentinels: Sentinels): string {
  let result = value;
  for (const [token, { name }] of sentinels) {
    if (token.startsWith("__AP_") && result.includes(token)) {
      result = result.split(token).join(`{{${name}}}`);
    }
  }
  return result === authSentinel ? result : result;
}

// splitURL separates a recorded URL into the connector-level base URL, the
// operation path, and the query template. Placeholders already substituted into
// the path survive because sentinels are URL-safe and pass through
// encodeURIComponent unchanged.
export function splitURL(rawUrl: string, sentinels: Sentinels): {
  baseUrl: string;
  path: string;
  query: Record<string, string>;
} {
  const url = new URL(rawUrl);
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[templatizeString(key, sentinels)] = templatizeString(value, sentinels);
  }
  return {
    baseUrl: url.origin,
    path: templatizeString(decodeURIComponent(url.pathname), sentinels),
    query,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
