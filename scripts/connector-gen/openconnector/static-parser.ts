function balanced(source: string, start: number): string | undefined { let depth = 0; let quote = ""; for (let i = start; i < source.length; i++) { const c = source[i]!; if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; } if (c === "\"" || c === "'") { quote = c; continue; } if (c === "[") depth++; else if (c === "]" && --depth === 0) return source.slice(start, i + 1); } return undefined; }
export type StaticAction = {
  id: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiredScopes: string[];
  schemaSource?: {
    input: string;
    output: string;
    requiresReviewedAdapter: true;
  };
  source: { path: string; line?: number };
};
export type StaticProvider = {
  id: string;
  displayName: string;
  actions: StaticAction[];
};
export type HoldReason = {
  providerId?: string;
  actionId?: string;
  code: string;
  detail: string;
};

type Span = { start: number; end: number; text: string };
function nextCall(source: string, from: number): number {
  let mode = "code";
  for (let i = from; i < source.length; i++) {
    const c = source[i]!,
      n = source[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") {
        mode = "line";
        i++;
        continue;
      }
      if (c === "/" && n === "*") {
        mode = "block";
        i++;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        mode = c;
        continue;
      }
      if (
        source.startsWith("defineProviderAction", i) &&
        /^\s*\(/.test(source.slice(i + 20))
      )
        return i;
    } else if (mode === "line") {
      if (c === "\n") mode = "code";
    } else if (mode === "block") {
      if (c === "*" && n === "/") {
        mode = "code";
        i++;
      }
    } else if (c === "\\") i++;
    else if (c === mode) mode = "code";
  }
  return -1;
}
function objectSpan(source: string, start: number): Span | undefined {
  let depth = 0,
    mode = "code";
  for (let i = start; i < source.length; i++) {
    const c = source[i]!,
      n = source[i + 1];
    if (mode === "code") {
      if (c === "'" || c === '"' || c === "`") {
        mode = c;
        continue;
      }
      if (c === "/") {
        if (n === "/") {
          mode = "line";
          i++;
          continue;
        }
        if (n === "*") {
          mode = "block";
          i++;
          continue;
        }
      }
      if (c === "{") depth++;
      if (c === "}" && --depth === 0)
        return { start, end: i + 1, text: source.slice(start, i + 1) };
    } else if (mode === "line") {
      if (c === "\n") mode = "code";
    } else if (mode === "block") {
      if (c === "*" && n === "/") {
        mode = "code";
        i++;
      }
    } else if (c === "\\") i++;
    else if (c === mode) mode = "code";
  }
  return undefined;
}
function literals(text: string): string[] {
  return [...text.matchAll(/(["'])(.*?)\1/g)].map((m) => m[2]!);
}
export function extractActions(
  source: string,
  path: string,
  providerId: string,
  requested?: readonly string[],
) {
  const holds: HoldReason[] = [];
  const actions: StaticAction[] = [];
  const scopes = new Map<string, string>();
  // Audited static source-array/map form; never execute the callback.
  for (const am of source.matchAll(/(?:const|let)\s+(\w+)\s*(?:\:\s*[^=]+)?=\s*\[/g)) {
    const start = source.indexOf("[", source.indexOf("=", am.index)); const body = balanced(source, start); if (!body) continue;
    const tail = source.slice(start + body.length); if (!new RegExp(`\\b${am[1]}\\.map\\s*\\(\\s*\\(?\\s*\\w+\\s*\\)?\\s*=>\\s*defineProviderAction\\s*\\(`).test(tail)) continue;
    for (const m of body.matchAll(/\{[\s\S]*?\bname\s*:\s*(["'])(.*?)\1[\s\S]*?\}/g)) {
      const id = m[2]!; if (requested && !requested.includes(id)) continue;
      if (actions.some(a => a.id === id)) { holds.push({ providerId, actionId: id, code: "DUPLICATE_ACTION", detail: "duplicate action id" }); continue; }
      actions.push({ id, description: id, requiredScopes: [], schemaSource: { input: "", output: "", requiresReviewedAdapter: true }, source: { path } });
    }
  }
  for (const m of source.matchAll(
    /(?:const|let|var)\s+(\w+)\s*=\s*["']([^"']+)["']/g,
  ))
    scopes.set(m[1]!, m[2]!);
  for (const m of source.matchAll(/(\w+)\s*:\s*["']([^"']+)["']/g))
    scopes.set(m[1]!, m[2]!);
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*\w+\.(\w+)/g)) {
    const v = scopes.get(m[2]!);
    if (v) scopes.set(m[1]!, v);
  }
  let cursor = 0;
  while (true) {
    const at = nextCall(source, cursor);
    if (at < 0) break;
    const open = source.indexOf("{", at);
    const span = open < 0 ? undefined : objectSpan(source, open);
    if (!span) {
      holds.push({
        providerId,
        code: "MALFORMED",
        detail: "unbalanced action object",
      });
      break;
    }
    const name = span.text.match(/\bname\s*:\s*(["'])(.*?)\1/);
    if (!name) {
      if ((/\bname\s*(?::\s*\w+\.name\b|,)/.test(span.text) || /defineProviderAction\(\s*\w+\s*,/.test(span.text)) && ((/function\s+action\s*\(/.test(source) && /return\s+defineProviderAction\(/.test(source)) || /\.map\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*defineProviderAction\s*\(/.test(source))) { cursor = span.end; continue; }
      holds.push({
        providerId,
        code: "DYNAMIC_NAME",
        detail: "action name must be literal",
      });
      cursor = span.end;
      continue;
    }
    const id = name[2]!;
    if (!requested || requested.includes(id)) {
      if (actions.some((a) => a.id === id))
        holds.push({
          providerId,
          actionId: id,
          code: "DUPLICATE_ACTION",
          detail: "duplicate action id",
        });
      else {
        const rs =
          span.text.match(/\brequiredScopes\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
        const requiredScopes = literals(rs).map((x) => scopes.get(x) ?? x);
        if (
          /\breadScope\b/.test(rs) &&
          !requiredScopes.length &&
          scopes.has("readScope")
        )
          requiredScopes.push(scopes.get("readScope")!);
        const input =
          span.text
            .match(/\binputSchema\s*:\s*([\s\S]*?)(?=,\s*outputSchema\b)/)?.[1]
            ?.trim() ?? "";
        const output =
          span.text
            .match(
              /\boutputSchema\s*:\s*([\s\S]*?)(?=,\s*(?:execute|handler|run)\b|\s*}\s*$)/,
            )?.[1]
            ?.trim() ?? "";
        actions.push({
          id,
          description:
            span.text.match(/\bdescription\s*:\s*(["'`])([\s\S]*?)\1/)?.[2] ??
            "",
          requiredScopes,
          schemaSource: { input, output, requiresReviewedAdapter: true },
          source: { path, line: source.slice(0, at).split("\n").length },
        });
      }
    }
    cursor = span.end;
  }
  if (requested) {
    actions.sort((a, b) => requested.indexOf(a.id) - requested.indexOf(b.id));
    for (const id of requested)
      if (!actions.some((a) => a.id === id))
        holds.push({
          providerId,
          actionId: id,
          code: "UNKNOWN_ACTION",
          detail: "requested action was not found",
        });
  }
  return { actions, holds };
}
