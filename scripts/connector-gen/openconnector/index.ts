import { extractProvider } from "./extract";
import { convert } from "./convert";
import { decideSelection } from "./selection";
import { verifyPinnedFiles } from "./provenance";
import { reviewedAdapters } from "./adapters";
import { approvedContracts } from "./contracts";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
export { extractProvider } from "./extract";
export { convert } from "./convert";
export { verifyPinnedFiles, sha256 } from "./provenance";

export function localCalendarDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const allowed = new Set(["--provider", "--source", "--out", "--help"]);
  if (args.some(a => a.startsWith("--") && !allowed.has(a)) || args.filter(a => a === "--provider").length > 1 || args.filter(a => a === "--source").length > 1 || args.filter(a => a === "--out").length > 1) throw new Error("INVALID_ARGUMENTS: unknown or duplicate flag");
  const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (!args.includes("--help") && args.some((a, i) => !a.startsWith("--") && (i === 0 || !["--provider", "--source", "--out"].includes(args[i-1]!)))) throw new Error("INVALID_ARGUMENTS: positional argument");
  if (args.includes("--help")) { console.log("usage: bun index.ts --provider coda|helpscout --source SNAPSHOT [--out DIR]"); process.exit(0); }
  if (["--provider", "--source", "--out"].some(flag => args.includes(flag) && (!args[args.indexOf(flag)+1] || args[args.indexOf(flag)+1]!.startsWith("--")))) throw new Error("INVALID_ARGUMENTS: missing flag value");
  const provider = value("--provider"); const source = value("--source");
  if (!provider || !source) { console.error("usage: bun .../index.ts --provider ID --source SNAPSHOT [--out DIR]"); process.exit(2); }
  const pinFile = new URL("./provenance.json", import.meta.url).pathname;
  const selectionFile = new URL("./selection.json", import.meta.url).pathname;
  if (!Object.prototype.hasOwnProperty.call(approvedContracts, provider)) throw new Error("UNKNOWN_PROVIDER: provider is not approved");
  const definition = `${source}/src/providers/${provider}/definition.ts`;
  const actions = `${source}/src/providers/${provider}/actions.ts`;
  const pinRecord = await Bun.file(pinFile).json();
  const record = pinRecord.records.find((r: any) => r.providerId === provider);
  if (!record) throw new Error("MISSING_PROVIDER_PIN");
  const filePins = Object.fromEntries(record.files.map((f: any) => [f.path, f.sha256]));
  filePins["LICENSE.txt"] = pinRecord.source.licenseSha256;
  filePins["NOTICE.md"] = pinRecord.source.noticeSha256;
  const verified = await verifyPinnedFiles(source, { ...pinRecord.source, files: filePins });
  const selectedAdapters = reviewedAdapters.filter(a => a.providerId === provider);
  const upstream = selectedAdapters.map(a => a.upstreamActionId).filter((id, i, all) => all.indexOf(id) === i);
  const extracted = extractProvider(provider, new TextDecoder().decode(verified[`src/providers/${provider}/definition.ts`]), new TextDecoder().decode(verified[`src/providers/${provider}/actions.ts`]), { definition, actions }, upstream);
  const selection = await Bun.file(selectionFile).json();
  const selected = selection.entries.find((e: any) => e.providerId === provider);
  if (!selected) throw new Error("HOLD: provider is not selected");
  const decisions = selected.operations.map((operationId: string) => decideSelection(selection, { providerId: provider, edition: selected.edition, operationId, upstreamSha: selected.upstreamSha, asOf: localCalendarDate() }));
  if (decisions.some((d: any) => d.decision !== "ADMIT")) { console.log(JSON.stringify({ extracted, decisions }, null, 2)); process.exit(3); }
  if (extracted.holds.length) { console.error(JSON.stringify({ extracted, decisions }, null, 2)); process.exit(3); }
  const result = await convert(extracted.providers[0]!, selectedAdapters, selected.operations);
  if (result.holds.length || !result.manifest) { console.error(JSON.stringify({ ...result, decisions }, null, 2)); process.exit(3); }
  const out = value("--out");
  if (out) { const dir = resolve(out); if (!dir.startsWith("/tmp/") || dir.slice(5).includes("/")) throw new Error("UNSAFE_OUTPUT: --out must be a new direct child directory under /tmp"); await mkdir(dir, { recursive: false }); await writeFile(join(dir, "manifest.json"), JSON.stringify(result.manifest, null, 2) + "\n", { flag: "wx" }); }
  console.log(JSON.stringify({ ...result, decisions }, null, 2));
}
