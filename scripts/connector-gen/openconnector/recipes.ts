import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ReviewedRecipe, SourceSpan } from "./recipe-types";
import { PINNED_UPSTREAM_SHA } from "./selection";

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const topKeys = ["schemaVersion", "providerId", "appcallId", "source", "selection", "research", "operationSources", "manifest"];
const own = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const exact = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).length === keys.length && keys.every((k) => Object.hasOwn(x, k));
const text = (x: unknown) => typeof x === "string" && x.length > 0;
const safePath = (p: unknown) => text(p) && !p.startsWith("/") && !p.split("/").includes("..") && !p.split("/").includes("") && !p.includes("\\") && !p.includes("\0") && p !== ".";
const assertSafe = (x: unknown, label: string) => { if (!safePath(x)) throw new Error(`${label} must be a safe relative path`); };
const keysOnly = (value: unknown, keys: string[], label: string) => { if (own(value) && Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`unsupported ${label} field`); };
function validateNativeManifest(manifest: Record<string, unknown>) {
  keysOnly(manifest, ["key", "name", "version", "runtime", "visibility", "categories", "auth", "network", "models", "http", "operations", "provenance", "evidence"], "manifest");
  if (own(manifest.evidence)) { keysOnly(manifest.evidence, ["fixture", "live"], "evidence"); for (const status of [manifest.evidence.fixture, manifest.evidence.live]) { if (!own(status) || Object.keys(status).length !== 1 || !["supplied", "unverified"].includes(String(status.status))) throw new Error("invalid evidence status"); } }
  if (own(manifest.provenance)) keysOnly(manifest.provenance, ["source"], "provenance");
  keysOnly(manifest.network, ["allowedHosts"], "network");
  keysOnly(manifest.auth, ["type", "scopes", "setup"], "auth");
  if (own(manifest.auth)) keysOnly(manifest.auth.setup, ["mode", "fields", "routes"], "auth setup");
  keysOnly(manifest.http, ["baseUrl", "auth", "headers", "query", "errors"], "http");
  if (own(manifest.http)) keysOnly(manifest.http.auth, ["field", "in", "name", "value", "basic"], "http auth");
  if (own(manifest.operations)) for (const operation of Object.values(manifest.operations)) {
    keysOnly(operation, ["kind", "sideEffect", "timeoutMs", "maxInputBytes", "maxResponseBytes", "title", "description", "inputSchema", "outputSchema", "enforceOutputSchema", "validationMode", "responseFormat", "request"], "operation");
    if (own(operation) && operation.validationMode !== undefined && !["legacy", "strict-generated"].includes(String(operation.validationMode))) throw new Error("unsupported validation mode");
    if (own(operation) && operation.responseFormat !== undefined && operation.responseFormat !== "json") throw new Error("unsupported response format");
    if (own(operation) && own(operation.request)) { keysOnly(operation.request, ["method", "path", "baseUrl", "query", "headers", "parameters", "body", "bodyEncoding", "success", "result", "echo"], "request"); if (operation.request.bodyEncoding !== undefined && operation.request.bodyEncoding !== "form") throw new Error("unsupported body encoding"); }
  }
}
async function assertNoSymlinkPath(path: string) { const absolute = resolve(path); const parts = absolute.split(sep); let current = parts[0] || sep; for (const part of parts.slice(1)) { current = join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new Error("recipe path contains a symlink"); } }

export function validateRecipeShape(value: unknown): asserts value is ReviewedRecipe {
  if (!own(value) || !exact(value, topKeys)) throw new Error("recipe has unknown or missing top-level fields");
  if (value.schemaVersion !== 1 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value.providerId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.appcallId) || !own(value.source) || !own(value.selection) || !own(value.research) || !own(value.operationSources) || !own(value.manifest)) throw new Error("malformed recipe shape");
  const source = value.source;
  if (!exact(source, ["url", "revision", "files", "spans"]) || !/^https?:\/\//.test(String(source.url)) || !text(source.revision) || !own(source.files) || !own(source.spans) || Object.keys(source.files).length === 0 || Object.keys(source.spans).length === 0) throw new Error("malformed source evidence");
  for (const [path, hash] of Object.entries(source.files)) { assertSafe(path, "source file"); if (!/^[a-f0-9]{64}$/.test(String(hash))) throw new Error("source file hash must be SHA-256"); }
  for (const [name, span] of Object.entries(source.spans)) { if (!own(span) || !exact(span, ["path", "startLine", "endLine"]) || !safePath(span.path) || !Object.hasOwn(source.files, span.path as string) || !Number.isInteger(span.startLine) || !Number.isInteger(span.endLine) || span.startLine < 1 || span.endLine < span.startLine) throw new Error(`malformed source span: ${name}`); }
  if (value.selection.providerId !== value.providerId || value.selection.appcallId !== value.appcallId || !Array.isArray(value.selection.operations) || value.selection.operations.length === 0) throw new Error("selection identity or operation allowlist mismatch");
  const selectionKeys = ["providerId", "appcallId", "disposition", "edition", "operations", "upstreamSha", "marketFocus", "ownership", "aliases", "research", "breach", "exception", "quality", "gates"];
  if (Object.keys(value.selection).some((key) => !selectionKeys.includes(key)) || value.source.revision !== value.selection.upstreamSha || value.source.revision !== PINNED_UPSTREAM_SHA) throw new Error("selection/source revision is not pinned");
  if (value.manifest.key !== value.appcallId || !own(value.manifest.operations)) throw new Error("manifest identity or operations missing");
  validateNativeManifest(value.manifest);
  if (!own(value.manifest.evidence)) throw new Error("manifest evidence is required");
  const provenance = value.manifest.provenance;
  if (!own(provenance) || !own(provenance.source) || String(provenance.source.url).replace(/\.git$/, "") !== String(source.url).replace(/\.git$/, "") || provenance.source.revision !== source.revision) throw new Error("manifest provenance source is required and must match recipe source");
  const ops = Object.keys(value.manifest.operations);
  const mappings = Object.keys(value.operationSources);
  if (ops.length !== mappings.length || ops.some((op) => !Object.hasOwn(value.operationSources, op))) throw new Error("every manifest operation needs exactly one source mapping");
  if (ops.length !== value.selection.operations.length || ops.some((op) => !value.selection.operations.includes(op))) throw new Error("selection operation allowlist must match manifest operations");
  for (const [op, mapping] of Object.entries(value.operationSources)) {
    if (!own(mapping) || !exact(mapping, ["upstreamActionId", "sourceRefs", "documentationUrls", "responseContract", "adaptations"]) || !text(mapping.upstreamActionId) || !Array.isArray(mapping.sourceRefs) || mapping.sourceRefs.length === 0 || !mapping.sourceRefs.every(text) || !Array.isArray(mapping.documentationUrls) || mapping.documentationUrls.length === 0 || !mapping.documentationUrls.every((u) => /^https?:\/\//.test(u)) || !["preserve-existing", "appcall-provider-json-v1"].includes(mapping.responseContract as string) || !Array.isArray(mapping.adaptations) || !mapping.adaptations.every(text)) throw new Error(`malformed operation source: ${op}`);
    for (const ref of mapping.sourceRefs) if (!Object.hasOwn(source.spans, ref)) throw new Error(`missing source span: ${ref}`);
  }
}

export function resolveRecipeReferences(recipe: ReviewedRecipe): ReviewedRecipe {
  validateRecipeShape(recipe);
  return recipe;
}

export async function readRecipe(dir: string): Promise<ReviewedRecipe> {
  const stat = await lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("recipe directory must not be a symlink");
  const path = join(dir, "recipe.json"); const fileStat = await lstat(path); if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_JSON_BYTES) throw new Error("recipe.json is missing, unsafe, or too large");
  let parsed: unknown; try { parsed = JSON.parse(await readFile(path, "utf8")); } catch { throw new Error("recipe.json is invalid JSON"); }
  validateRecipeShape(parsed); return resolveRecipeReferences(parsed);
}

export async function discoverRecipes(root: string): Promise<ReviewedRecipe[]> {
  const base = resolve(root); await assertNoSymlinkPath(base); const rootStat = await lstat(base); if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("recipe root must not be a symlink"); const entries = await readdir(base, { withFileTypes: true }); const dirs = entries.filter((e) => e.isDirectory() && !e.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name));
  const out: ReviewedRecipe[] = []; const identities = new Set<string>();
  for (const entry of dirs) { if (!safePath(entry.name)) throw new Error("unsafe recipe directory name"); const recipe = await readRecipe(join(base, entry.name)); if (recipe.providerId !== entry.name) throw new Error("providerId must match recipe directory"); const id = recipe.appcallId; if (identities.has(id)) throw new Error(`duplicate recipe identity: ${id}`); identities.add(id); out.push(recipe); }
  return out;
}
