// Break the import cycle a piece's own sources create.
//
// The common Activepieces shape is: `src/index.ts` declares the piece auth and
// imports every action, while each action imports that auth back from the
// index. Under plain ESM evaluation that cycle throws "Cannot access X before
// initialization" or leaves a binding undefined — the single biggest reason a
// piece cannot be read here.
//
// The extractor reads actions from their own modules, so the index is only
// needed for the piece's display name and auth. Removing its action and trigger
// imports, and emptying the arrays that referenced them, leaves every other
// declaration exactly where it was and removes the cycle entirely.

export function decycleIndex(source: string): string {
  let result = stripModuleImports(source, /\/(actions?|triggers?)(\/|$)/);
  result = emptyArrayProperty(result, "actions");
  result = emptyArrayProperty(result, "triggers");
  return result;
}

// stripModuleImports removes whole import statements whose specifier matches,
// including the multi-line braced form.
export function stripModuleImports(source: string, specifierPattern: RegExp): string {
  return source.replace(/^import\s[\s\S]*?from\s*['"]([^'"]+)['"];?[ \t]*$/gm, (statement, specifier: string) =>
    specifierPattern.test(specifier) ? "" : statement,
  );
}

// emptyArrayProperty rewrites `name: [ … ]` to `name: []`, scanning brackets so
// a nested array or an object literal inside the list cannot end it early.
export function emptyArrayProperty(source: string, name: string): string {
  const pattern = new RegExp(`(^|[\\s,{])${name}\\s*:\\s*\\[`, "g");
  let result = "";
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    if (openIndex < cursor) {
      continue;
    }
    const closeIndex = matchingBracket(source, openIndex);
    if (closeIndex === -1) {
      continue;
    }
    result += source.slice(cursor, openIndex + 1);
    cursor = closeIndex;
  }

  return result + source.slice(cursor);
}

function matchingBracket(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]!;

    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[" || char === "{" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "]" || char === "}" || char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}
