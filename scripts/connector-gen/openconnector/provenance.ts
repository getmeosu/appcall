import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type SourcePin = { repo: string; commit: string; treeSha256?: string; treeOid?: string; files?: Record<string, string> };
export type SourceRef = { path: string; sha256: string; line?: number };
export type ProvenanceRecord = { source: SourcePin; providerId: string; actionIds: string[]; files: SourceRef[]; license: string; modifications: string[] };

export function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
export async function verifyRecordedFiles(root: string, files: Record<string, string>, committed: (path: string) => Promise<Uint8Array>): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  for (const [file, expected] of Object.entries(files)) {
    const path = safePath(root, file); await assertNoSymlink(root, file);
    const local = await readFile(path).catch(() => { throw new Error(`INVALID_SOURCE_FILE: ${file}`); });
    if (sha256(local) !== expected) throw new Error(`HASH_MISMATCH: ${file}`);
    if (sha256(await committed(file)) !== expected) throw new Error(`COMMITTED_HASH_MISMATCH: ${file}`);
    result[file] = local;
  }
  return result;
}

export const PINNED_COMMIT = "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a";
export const PINNED_TREE_OID = "b4947fb8166399c93fb0b40fabd959af114bdc9d";
export const PINNED_REPO = "https://github.com/oomol-lab/open-connector.git";
function safePath(root: string, file: string): string {
  if (!file || isAbsolute(file) || file.includes("\\") || file.split("/").includes("..")) throw new Error(`UNSAFE_SOURCE_PATH: ${file}`);
  const base = resolve(root); const path = resolve(base, file); if (!path.startsWith(base + sep)) throw new Error(`UNSAFE_SOURCE_PATH: ${file}`); return path;
}
async function assertNoSymlink(root: string, file: string): Promise<void> {
  let current = resolve(root); for (const part of relative(resolve(root), resolve(resolve(root), file)).split(sep)) { current = resolve(current, part); const stat = await lstat(current).catch(() => null); if (!stat || stat.isSymbolicLink()) throw new Error(`INVALID_SOURCE_FILE: ${file}`); }
}
export async function verifyPinnedFiles(root: string, pin: SourcePin): Promise<Record<string, Uint8Array>> {
  for (const [file, expected] of Object.entries(pin.files ?? {})) { safePath(root, file); if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`MALFORMED_SHA256: ${file}`); }
  if (pin.repo !== PINNED_REPO) throw new Error("PIN_MISMATCH: unapproved repository");
  if (pin.commit !== PINNED_COMMIT) throw new Error("PIN_MISMATCH: unapproved commit");
  if (!pin.treeOid) throw new Error("MISSING_TREE_PIN");
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (head !== pin.commit) throw new Error(`PIN_MISMATCH: expected ${pin.commit}, got ${head}`);
  const tree = await git(root, ["rev-parse", `${pin.commit}^{tree}`]);
  if (tree !== PINNED_TREE_OID || (pin.treeOid && tree !== pin.treeOid)) throw new Error("TREE_HASH_MISMATCH");
  const result: Record<string, Uint8Array> = {};
  const entries = Object.entries(pin.files ?? {}); if (!entries.length) throw new Error("MISSING_FILE_PIN");
  for (const [file, expected] of entries) {
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`MALFORMED_SHA256: ${file}`);
    const path = safePath(root, file); await assertNoSymlink(root, file);
    const local = await readFile(path);
    if (sha256(local) !== expected) throw new Error(`HASH_MISMATCH: ${file}`);
    const committed = await gitBytes(root, ["show", `${pin.commit}:${file}`]);
    if (sha256(committed) !== expected) throw new Error(`COMMITTED_HASH_MISMATCH: ${file}`);
    result[file] = local;
  }
  return result;
}

async function git(root: string, args: string[]): Promise<string> {
  const out = new TextDecoder().decode(await gitBytes(root, args));
  return out.trim();
}
async function gitBytes(root: string, args: string[]): Promise<Uint8Array> {
  const proc = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" } });
  const out = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) throw new Error(`GIT_FAILED: ${args.join(" ")}`);
  return out;
}

export function sourceRef(path: string, content: string, line?: number): SourceRef { return { path, sha256: sha256(content), ...(line === undefined ? {} : { line }) }; }
