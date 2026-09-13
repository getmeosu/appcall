import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export type RuntimeFingerprint = { runtimeRoot: string; bunVersion: string; files: Record<string, string>; aggregateHash: string };
const root = resolve(import.meta.dir, "../../../runner/bun/src");

async function walk(dir: string, base: string, out: Record<string, string>): Promise<void> {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name); const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`RUNTIME_SYMLINK: ${relative(base, path)}`);
    if (stat.isDirectory()) await walk(path, base, out);
    else if (stat.isFile()) out[relative(base, path)] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
}

export async function fingerprintRuntime(): Promise<RuntimeFingerprint> { return fingerprintRuntimeAt(root); }
export async function fingerprintRuntimeAt(runtimeRoot: string): Promise<RuntimeFingerprint> {
  const base = resolve(runtimeRoot); const stat = await lstat(base);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("RUNTIME_ROOT_INVALID");
  const files: Record<string, string> = {}; await walk(base, base, files);
  const bunVersion = typeof Bun === "undefined" ? "unknown" : Bun.version;
  const aggregateHash = createHash("sha256").update(JSON.stringify({ bunVersion, files: Object.entries(files).sort(([a], [b]) => a.localeCompare(b)) })).digest("hex");
  return { runtimeRoot: base, bunVersion, files, aggregateHash };
}
