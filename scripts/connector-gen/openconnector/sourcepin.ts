import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inventoryCatalog } from "./inventory";
import { PINNED_COMMIT, PINNED_REPO, PINNED_TREE_OID } from "./provenance";
import { dossierFromProvider } from "./dossier";
import { reconcileNativeIdentities, loadNativeIdentityCatalog } from "./native-identities";
const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");

export async function loadNativeIdentityInventory(nativeBase = "HEAD") {
  const baseCommit = (await execFileAsync("git", ["-C", PROJECT_ROOT, "rev-parse", "--verify", `${nativeBase}^{commit}`])).stdout.trim();
  const baseRows = (await execFileAsync("git", ["-C", PROJECT_ROOT, "ls-tree", "-r", "--name-only", baseCommit, "--", "runner/connectors"])).stdout.split("\n").filter((p) => /\/manifest\.json$/.test(p));
  const baseline: string[] = [];
  for (const path of baseRows) { const content = (await execFileAsync("git", ["-C", PROJECT_ROOT, "show", `${baseCommit}:${path}`])).stdout; let manifest: any; try { manifest = JSON.parse(content); } catch { throw new Error(`INVALID_BASE_MANIFEST: ${path}`); } if (typeof manifest.key !== "string" || !manifest.key) throw new Error(`INVALID_BASE_MANIFEST: ${path}`); baseline.push(manifest.key); }
  const currentRows = await readdir(join(PROJECT_ROOT, "runner", "connectors"), { withFileTypes: true });
  const current: string[] = [];
  for (const entry of currentRows) { if (!entry.isDirectory()) continue; const path = join(PROJECT_ROOT, "runner", "connectors", entry.name, "manifest.json"); let raw: string; try { raw = await readFile(path, "utf8"); } catch (error: any) { if (error?.code === "ENOENT") continue; throw error; } let manifest: any; try { manifest = JSON.parse(raw); } catch { throw new Error(`INVALID_CURRENT_MANIFEST: ${entry.name}`); } if (typeof manifest.key !== "string" || !manifest.key) throw new Error(`INVALID_CURRENT_MANIFEST: ${entry.name}`); current.push(manifest.key); }
  return { baseCommit, baseline, current };
}

export function parseSourcePinArgs(argv: string[]) {
  const allowed = new Set(["--source", "--out", "--as-of", "--native-base"]); const seen = new Set<string>(); for (let i = 0; i < argv.length; i += 2) { const flag = argv[i]; if (!allowed.has(flag!) || seen.has(flag!) || !argv[i + 1] || argv[i + 1]!.startsWith("--")) throw new Error("INVALID_ARGUMENTS: usage sourcepin --source SNAPSHOT --out /tmp/DIR --as-of YYYY-MM-DD [--native-base REF]"); seen.add(flag!); }
  const get = (flag: string) => { const i = argv.indexOf(flag); return i < 0 ? undefined : argv[i + 1]; };
  const source = get("--source"), out = get("--out"), asOf = get("--as-of");
  let validDate = false; try { validDate = new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) === asOf; } catch { validDate = false; }
  const nativeBase = get("--native-base");
  if (!source || !out || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !validDate) throw new Error("INVALID_ARGUMENTS: usage sourcepin --source SNAPSHOT --out /tmp/DIR --as-of YYYY-MM-DD [--native-base REF]");
  const target = resolve(out); if (resolve(target, "..") !== resolve(tmpdir())) throw new Error("UNSAFE_OUTPUT: --out must be a direct child of the staging temp directory");
  return { source: resolve(source), out: target, asOf, nativeBase };
}

export async function runSourcePin(args: { source: string; out: string; asOf: string; nativeBase?: string }) {
  const nativeBase = args.nativeBase ?? "HEAD";
  const nativeInventory = await loadNativeIdentityInventory(nativeBase);
  const baseCommit = nativeInventory.baseCommit;
  const baselineIds = nativeInventory.baseline;
  const currentIds = nativeInventory.current;
  const identityCatalog = await loadNativeIdentityCatalog();
  const inventory = await inventoryCatalog({ sourceRoot: args.source });
  await mkdir(args.out).catch((e: any) => { if (e?.code === "EEXIST") throw new Error("OUTPUT_EXISTS: --out must name a fresh directory"); throw e; });
  const providers = [];
  for (const p of inventory.providers) { const pinned: Record<string, Uint8Array> = {}; for (const path of p.files) { const proc = Bun.spawn(["git", "-C", args.source, "show", `${PINNED_COMMIT}:${path}`], { stdout: "pipe", stderr: "pipe" }); const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer()); if ((await proc.exited) !== 0) throw new Error(`PINNED_BLOB_READ_FAILED: ${path}`); pinned[path] = bytes; }
    const dossier = await dossierFromProvider(args.source, p.providerId, pinned); const dossierPath = `dossiers/${p.providerId}.json`; await mkdir(join(args.out, "dossiers"), { recursive: true }); await writeFile(join(args.out, dossierPath), JSON.stringify(dossier, null, 2) + "\n", { mode: 0o644 }); providers.push({ ...p, dossierPath, dossierStatus: dossier.status, sourceBindingStatus: p.existingAppCallId ? "PENDING_REVIEW" : "UNBOUND", disposition: (p.status === "HOLD" || dossier.status === "HOLD") ? "TECHNICAL_HOLD" : "EVIDENCE_AWAITING_REVIEW" }); }
  const identities = reconcileNativeIdentities(inventory.providers, baselineIds, currentIds, identityCatalog.mappings ?? {});
  const index = { schemaVersion: 1, generatedAt: args.asOf, source: { repo: PINNED_REPO, commit: PINNED_COMMIT, treeOid: PINNED_TREE_OID }, nativeInventory: { baselineRevision: baseCommit, ...identities }, counts: { ...inventory.counts, dossiers: providers.length, dossierHolds: providers.filter(p => p.dossierStatus === "HOLD").length }, providers };
  await writeFile(join(args.out, "index.json"), JSON.stringify(index, null, 2) + "\n", { mode: 0o644 });
  return index;
}

if (import.meta.main) { try { console.log(JSON.stringify(await runSourcePin(parseSourcePinArgs(Bun.argv.slice(2))), null, 2)); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); } }
