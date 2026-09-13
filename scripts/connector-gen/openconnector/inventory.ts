import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractActions } from "./static-parser";
import { PINNED_COMMIT, PINNED_TREE_OID } from "./provenance";

const execFileAsync = promisify(execFile);
export type InventoryProvider = { providerId: string; definitionPath: string; definitionSha256: string; files: string[]; fileSha256: Record<string, string>; displayName?: string; homepageUrl?: string; actionCount: number; status: "metadata" | "HOLD"; holdReasons: string[]; existingAppCallId?: string };
export type InventoryReport = { sourceRoot: string; sourcePin: string; providers: InventoryProvider[]; counts: { providers: number; metadata: number; holds: number; actions: number } };

export async function inventoryCatalog(input: { sourceRoot: string; existingIds?: Iterable<string>; aliases?: Record<string, string> }): Promise<InventoryReport> {
  const root = join(input.sourceRoot, "src", "providers");
  const pin = (await execFileAsync("git", ["-C", input.sourceRoot, "rev-parse", "HEAD"])).stdout.trim();
  const expected = PINNED_COMMIT;
  if (pin !== expected) throw new Error(`PIN_MISMATCH: expected ${expected}, got ${pin}`);
  const tree = (await execFileAsync("git", ["-C", input.sourceRoot, "rev-parse", `${pin}^{tree}`])).stdout.trim();
  if (tree !== PINNED_TREE_OID && expected === PINNED_COMMIT) throw new Error(`TREE_HASH_MISMATCH: expected ${PINNED_TREE_OID}, got ${tree}`);
  const treeEntries = (await execFileAsync("git", ["-C", input.sourceRoot, "ls-tree", "-r", "-z", pin, "--", "src/providers"])).stdout.split("\0").filter(Boolean);
  const tracked = new Map<string, string>();
  for (const row of treeEntries) { const m = row.match(/^(\d+)\s+\w+\s+([0-9a-f]+)\t(.+)$/); if (m) { if (m[1] === "120000") throw new Error(`SYMLINK_SOURCE_FILE: ${m[3]}`); tracked.set(m[3]!, m[2]!); } }
  const status = (await execFileAsync("git", ["-C", input.sourceRoot, "status", "--porcelain", "--", "src/providers"])).stdout.trim();
  if (status) throw new Error("SOURCE_DIR_DIRTY: src/providers has uncommitted changes");
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(input.existingIds ?? []); const aliases = input.aliases ?? {}; const providers: InventoryProvider[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`symlink provider directory: ${entry.name}`);
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name); if ((await lstat(dir)).isSymbolicLink()) throw new Error(`symlink provider directory: ${entry.name}`);
    const files: string[] = []; const fileSha256: Record<string, string> = {};
    for (const file of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (file.isSymbolicLink()) throw new Error(`symlink provider file: ${entry.name}/${file.name}`); if (!file.isFile()) continue;
      const path = join(dir, file.name); const key = relative(input.sourceRoot, path); const blob = tracked.get(key); if (!blob) throw new Error(`UNTRACKED_SOURCE_FILE: ${key}`); files.push(key); const bytes = await readFile(path); const gitBlob = createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex"); if (gitBlob !== blob) throw new Error(`COMMITTED_HASH_MISMATCH: ${key}`); fileSha256[key] = createHash("sha256").update(bytes).digest("hex");
    }
    const reasons: string[] = []; let definition = ""; let actions = "";
    try { definition = await readFile(join(dir, "definition.ts"), "utf8"); } catch { reasons.push("missing definition.ts"); }
    try { actions = await readFile(join(dir, "actions.ts"), "utf8"); } catch { reasons.push("missing actions.ts"); }
    const parsed = extractActions(actions, relative(input.sourceRoot, join(dir, "actions.ts")), entry.name); const actionCount = parsed.actions.length; if (!actionCount) reasons.push("no actions");
    providers.push({ providerId: entry.name, definitionPath: relative(input.sourceRoot, join(dir, "definition.ts")), definitionSha256: createHash("sha256").update(definition).digest("hex"), files, fileSha256, displayName: definition.match(/displayName:\s*["']([^"']+)["']/)?.[1], homepageUrl: definition.match(/homepageUrl:\s*["']([^"']+)["']/)?.[1], actionCount, status: reasons.length ? "HOLD" : "metadata", holdReasons: reasons, existingAppCallId: ids.has(entry.name) ? entry.name : aliases[entry.name] });
  }
  const sourcePin = pin;
  const holds = providers.filter((p) => p.status === "HOLD").length;
  return { sourceRoot: input.sourceRoot, sourcePin, providers, counts: { providers: providers.length, metadata: providers.length - holds, holds, actions: providers.reduce((n, p) => n + p.actionCount, 0) } };
}
