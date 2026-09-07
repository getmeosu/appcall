// Build a throwaway workspace where a piece can be imported.
//
// A piece imports two Activepieces packages plus whatever else its author
// reached for — date libraries, crypto helpers, vendor SDKs. Installing that
// dependency tree to read an action's shape would be absurd, and intercepting
// resolution with a runtime plugin is not reliable across Bun versions. So the
// workspace does it with ordinary node resolution: copy the piece, then
// synthesise a `node_modules` containing our two shims and a generated proxy
// package for every other specifier the piece's sources mention.
//
// Nothing is written into the Activepieces checkout; the workspace is a
// temporary directory the caller owns.

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { importedNames, generateStubSource } from "./resolver";
import { decycleIndex } from "./decycle";

const shimDir = new URL("./shims/", import.meta.url).pathname;

const realPackages: Record<string, string> = {
  "@activepieces/pieces-framework": `${shimDir}pieces-framework.ts`,
  "@activepieces/pieces-common": `${shimDir}pieces-common.ts`,
};

export function scanSpecifiers(root: string): Map<string, Set<string>> {
  const specifiers = new Map<string, Set<string>>();

  for (const file of walk(root)) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx") && !file.endsWith(".js")) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:") || specifier.startsWith("bun:")) {
        continue;
      }
      const packageName = packageNameOf(specifier);
      const names = specifiers.get(packageName) ?? new Set<string>();
      for (const name of importedNames(source, specifier)) {
        names.add(name);
      }
      specifiers.set(packageName, names);
    }
  }

  return specifiers;
}

export async function prepareWorkspace(piecesRoot: string, pieceName: string, workspaceRoot: string): Promise<string> {
  const source = join(resolve(piecesRoot), pieceName);
  if (!existsSync(source)) {
    throw new Error(`piece not found: ${source}`);
  }

  const pieceDir = join(workspaceRoot, "piece");
  cpSync(source, pieceDir, { recursive: true });

  const modules = join(workspaceRoot, "node_modules");
  mkdirSync(modules, { recursive: true });

  const specifiers = scanSpecifiers(pieceDir);

  for (const [packageName, shimPath] of Object.entries(realPackages)) {
    // Our shims cover the surface that matters, not the whole package. Any
    // other name a piece imports from them is filled with a proxy so the module
    // still loads — Bun rejects an ESM named import a module does not export.
    const wanted = specifiers.get(packageName) ?? new Set<string>();
    const provided = new Set(Object.keys(await import(shimPath)));
    const missing = [...wanted].filter((name) => name !== "default" && !provided.has(name));
    writePackage(modules, packageName, [
      `export * from ${JSON.stringify(shimPath)};`,
      missing.length > 0 ? generateStubSource(missing).replace("export default stub;", "") : "",
    ].join("\n"));
  }

  for (const [packageName, names] of specifiers) {
    if (realPackages[packageName]) {
      continue;
    }
    writePackage(modules, packageName, generateStubSource([...names]));
  }

  const entry = join(pieceDir, "src", "index.ts");
  if (!existsSync(entry)) {
    throw new Error(`piece entry not found: ${entry}`);
  }
  // The index is only read for the piece's display name and auth, so its action
  // and trigger imports come out and the cycle with them.
  writeFileSync(entry, decycleIndex(readFileSync(entry, "utf8")));
  return entry;
}

// actionModules lists the piece's action source files. Importing those directly,
// rather than the piece index, is what makes a piece with the common circular
// shape load at all: an action module that imports its auth from the piece index
// hits a temporal-dead-zone error when the index is evaluated first, and no
// error at all when the action module is.
export function actionModules(entry: string): string[] {
  const actionsDir = join(entry, "..", "lib", "actions");
  if (!existsSync(actionsDir)) {
    return [];
  }
  return [...walk(actionsDir)]
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !file.includes(".test."))
    .sort();
}

function writePackage(modules: string, packageName: string, contents: string): void {
  const dir = join(modules, ...packageName.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.js"), contents);
  // The wildcard export makes a deep import ("zod/mini", "dayjs/plugin/utc")
  // resolve to the same stub instead of failing on a missing subpath.
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        type: "module",
        main: "index.js",
        exports: { ".": "./index.js", "./*": "./index.js" },
      },
      null,
      2,
    )}\n`,
  );
}

// packageNameOf reduces a deep import ("dayjs/plugin/utc") to the package that
// must exist in node_modules, keeping the scope for scoped packages.
export function packageNameOf(specifier: string): string {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]!;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }
      yield* walk(path);
      continue;
    }
    yield path;
  }
}
