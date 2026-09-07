// Module resolution for reading an Activepieces piece without installing its
// dependency tree.
//
// Three rules, applied only to files under the piece root so the extractor
// cannot disturb resolution for the rest of the process:
//   1. `@activepieces/pieces-framework` and `@activepieces/pieces-common` map to
//      our shims, which is where the action descriptor and the HTTP boundary
//      live.
//   2. A bare specifier that genuinely resolves (a package that happens to be
//      installed) is left alone.
//   3. Anything else becomes a generated proxy module exporting exactly the
//      names the importing file asks for. Bun refuses an ESM named import that
//      a module does not export, so the stub is generated per import site
//      rather than shared.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const shimDir = new URL("./shims/", import.meta.url).pathname;
const stubNamespace = "ap-stub";

export function importedNames(source: string, specifier: string): string[] {
  const names = new Set<string>();
  const quoted = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:import|export)\\s+([^;]*?)\\s+from\\s*['"]${quoted}['"]`,
    "g",
  );

  for (const match of source.matchAll(pattern)) {
    const clause = match[1] ?? "";
    const braced = clause.match(/\{([^}]*)\}/);
    if (braced) {
      for (const entry of braced[1]!.split(",")) {
        const name = entry.split(/\s+as\s+/).pop()?.trim();
        if (name) {
          names.add(name);
        }
      }
    }
    const defaultBinding = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+\w+/, "").split(",")[0]?.trim();
    if (defaultBinding && /^[A-Za-z_$][\w$]*$/.test(defaultBinding)) {
      names.add("default");
    }
  }

  return [...names];
}

export function generateStubSource(names: string[]): string {
  const exports = names
    .filter((name) => name !== "default")
    .map((name) => `export const ${name} = stub;`)
    .join("\n");

  return `
function makeProxy() {
  const target = function () { return makeProxy(); };
  return new Proxy(target, {
    get(_t, key) {
      if (key === "then") return undefined;
      if (key === Symbol.toPrimitive || key === "toString" || key === Symbol.toStringTag) return () => "";
      return makeProxy();
    },
    apply() { return makeProxy(); },
    construct() { return makeProxy(); },
  });
}
const stub = makeProxy();
export default stub;
${exports}
`;
}

export function registerResolver(pieceRoot: string): void {
  const root = resolve(pieceRoot);

  Bun.plugin({
    name: "activepieces-extractor",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args: { path: string; importer: string }) => {
        const importer = args.importer ?? "";
        if (!importer.startsWith(root)) {
          return undefined;
        }
        if (args.path === "@activepieces/pieces-framework") {
          return { path: `${shimDir}pieces-framework.ts` };
        }
        if (args.path === "@activepieces/pieces-common") {
          return { path: `${shimDir}pieces-common.ts` };
        }
        if (args.path.startsWith(".") || args.path.startsWith("/") || args.path.startsWith("node:") || args.path.startsWith("bun:")) {
          return undefined;
        }
        try {
          return { path: Bun.resolveSync(args.path, dirname(importer)) };
        } catch {
          const names = safeImportedNames(importer, args.path);
          return { path: `${args.path}::${names.join(",")}`, namespace: stubNamespace };
        }
      });

      build.onLoad({ filter: /.*/, namespace: stubNamespace }, (args: { path: string }) => {
        const names = (args.path.split("::")[1] ?? "").split(",").filter((name) => name.length > 0);
        return { contents: generateStubSource(names), loader: "js" };
      });
    },
  });
}

function safeImportedNames(importer: string, specifier: string): string[] {
  try {
    return importedNames(readFileSync(importer, "utf8"), specifier);
  } catch {
    return [];
  }
}
