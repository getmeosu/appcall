import { createHash } from "node:crypto";
import {
  verifyPinnedFiles,
  sha256,
  PINNED_COMMIT,
  PINNED_REPO,
  PINNED_TREE_OID,
} from "./provenance";
import { extractActions } from "./static-parser";
import { decideSelection, type SelectionRegistry } from "./selection";
import { validateRecipeShape } from "./recipes";
import type { ReviewedRecipe } from "./recipe-types";
import {
  runCandidateFixtures,
  verifyFixtureCoverage,
  type FixtureCase,
} from "./recipe-fixtures";
import { reviewedIds } from "./reviewed-action-ids";
import { curatedTemplates } from "./templates";

export type RecipeStatus = "ACCEPTED" | "HOLD" | "EXCLUDE" | "FAILED";
export type RecipeRecord = {
  providerId: string;
  appcallId: string;
  status: RecipeStatus;
  reasons: string[];
  candidateSha?: string;
  fixture?: unknown;
  sourceRevision?: string;
  policyHash?: string;
  asOf?: string;
};
export type BuiltArtifact = {
  appcallId: string;
  recipeBytes: Uint8Array;
  manifestBytes: Uint8Array;
  sourceRoot: string;
  sourceHashes: Record<string, string>;
  recipeDir: string;
  fixtureFiles: Record<string, Uint8Array>;
  readmeBytes?: Uint8Array;
};
export type RecipeSnapshot = {
  root: string;
  actionIds?: readonly string[];
  inventory?: readonly { providerId: string; appcallId?: string }[];
  existingIds?: Iterable<string>;
  aliases?: Record<string, string>;
};
export type CatalogOptions = {
  recipes: readonly ReviewedRecipe[];
  asOf: string;
  snapshot: RecipeSnapshot;
  recipeDirs?: Record<string, string>;
  fixtureCases?: (r: ReviewedRecipe) => readonly FixtureCase[];
};
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object)
          .sort()
          .map(
            (k) =>
              JSON.stringify(k) +
              ":" +
              canonical((v as Record<string, unknown>)[k]),
          )
          .join(",")}}`
      : JSON.stringify(v);
const ph = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
const nativeRequestInputs = (request: unknown, sharedHttp?: unknown): Set<string> => {
  const found = new Set<string>();
  const seen = new WeakSet<object>();
  let nodes = 0;
  const walk = (value: unknown, depth: number) => {
    if (++nodes > 10_000 || depth > 32) throw new Error("native request binding scan exceeded bounds");
    if (value === null || typeof value !== "object") {
      if (typeof value === "string")
        for (const match of value.matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g))
          found.add(match[1]!.split(".")[0]!);
      return;
    }
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) for (const item of value) walk(item, depth + 1);
    else for (const item of Object.values(value as Record<string, unknown>)) walk(item, depth + 1);
  };
  if (request && typeof request === "object") {
    const native = request as Record<string, unknown>;
    for (const key of ["path", "baseUrl", "body"]) walk(native[key], 0);
    const pathRoots = new Set<string>();
    if (typeof native.path === "string")
      for (const match of native.path.matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g))
        pathRoots.add(match[1]!);
    if (Array.isArray(native.parameters))
      for (const parameter of native.parameters) {
        if (++nodes > 10_000) throw new Error("native request binding scan exceeded bounds");
        if (parameter && typeof parameter === "object" && typeof (parameter as Record<string, unknown>).inputName === "string")
          {
            const p = parameter as Record<string, string>;
            const inputRoot = p.inputName.split(".")[0]!;
            const wireRoot = p.wireName?.split(".")[0];
            if ((p.in === "query" || p.in === "header") || (p.in === "path" && (pathRoots.has(p.inputName) || (!!p.wireName && pathRoots.has(p.wireName)))))
              found.add(inputRoot);
          }
      }
  }
  {
    const shared = (sharedHttp && typeof sharedHttp === "object" ? sharedHttp : {}) as Record<string, unknown>;
    for (const key of ["baseUrl"]) walk(Object.hasOwn(request as object, key) ? (request as Record<string, unknown>)[key] : shared[key], 0);
    const structured = Array.isArray((request as Record<string, unknown> | null)?.parameters)
      ? ((request as Record<string, unknown>).parameters as unknown[]).filter(
          (parameter) => parameter && typeof parameter === "object" &&
            (((parameter as Record<string, unknown>).in === "query") ||
              ((parameter as Record<string, unknown>).in === "header")),
        ) as Record<string, unknown>[]
      : [];
    for (const key of ["query", "headers"] as const) {
      const overridden = new Set(
        structured
          .filter((parameter) => parameter.in === (key === "query" ? "query" : "header"))
          .flatMap((parameter) => [parameter.wireName, parameter.inputName])
          .filter((name): name is string => typeof name === "string"),
      );
      const mergeEffective = (value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([name]) => !overridden.has(name)));
      };
      walk(mergeEffective(shared[key]), 0);
      walk(mergeEffective((request as Record<string, unknown>)[key]), 0);
    }
  }
  return found;
};
export async function verifyRecipeSources(
  r: ReviewedRecipe,
  s: RecipeSnapshot,
) {
  const repo = r.source.url.replace(/\.git$/, " ").trim();
  if (
    repo !== PINNED_REPO.replace(/\.git$/, "") ||
    r.source.revision !== PINNED_COMMIT
  )
    throw Error("PIN_MISMATCH: recipe is not pinned upstream");
  const files = await verifyPinnedFiles(s.root, {
    repo: PINNED_REPO,
    commit: r.source.revision,
    treeOid: PINNED_TREE_OID,
    files: r.source.files,
  });
  const path = `src/providers/${r.providerId}/actions.ts`;
  const bytes = files[path];
  const extracted = extractActions(
    new TextDecoder().decode(bytes),
    path,
    r.providerId,
  ).actions.map((x) => x.id);
  const actions =
    reviewedIds(r.providerId, r.source.revision, path, sha256(bytes)) ??
    extracted;
  for (const m of Object.values(r.operationSources))
    if (!actions.includes(m.upstreamActionId))
      throw Error(`upstream action does not exist: ${m.upstreamActionId}`);
  for (const span of Object.values(r.source.spans)) {
    const lines = new TextDecoder().decode(files[span.path]).split(/\r?\n/);
    if (span.endLine > lines.length) throw Error("source span outside file");
  }
  return files;
}
export function evaluateRecipeSelection(r: ReviewedRecipe, asOf: string) {
  const d = r.selection.operations.map((operationId) =>
    decideSelection({ entries: [r.selection] } as SelectionRegistry, {
      providerId: r.providerId,
      edition: r.selection.edition,
      operationId,
      upstreamSha: r.selection.upstreamSha,
      asOf,
    }),
  );
  return {
    decision: d.some((x) => x.decision === "EXCLUDE")
      ? "EXCLUDE"
      : d.every((x) => x.decision === "ADMIT")
        ? "ADMIT"
        : "HOLD",
    reasons: d.flatMap((x) => x.reasons),
  };
}
export function validateRecipeSemantics(r: ReviewedRecipe, s?: RecipeSnapshot) {
  const e: string[] = [];
  try {
    validateRecipeShape(r);
  } catch (x) {
    e.push(x instanceof Error ? x.message : String(x));
  }
  if (
    r.manifest.key !== r.appcallId ||
    r.selection.providerId !== r.providerId ||
    r.selection.appcallId !== r.appcallId
  )
    e.push("identity mismatch");
  if (s?.actionIds)
    for (const x of Object.values(r.operationSources))
      if (!s.actionIds.includes(x.upstreamActionId))
        e.push(`upstream action does not exist: ${x.upstreamActionId}`);
  const baseline = (curatedTemplates as Record<string, any>)[r.appcallId];
  for (const [id, m] of Object.entries(r.operationSources)) {
    if (m.responseContract === "preserve-existing") {
      if (!baseline || !baseline.operations?.[id] || canonical((r.manifest.operations as Record<string, any>)[id]) !== canonical(baseline.operations[id]) || canonical((r.manifest as any).auth) !== canonical(baseline.auth) || canonical((r.manifest as any).http) !== canonical(baseline.http) || canonical((r.manifest as any).network) !== canonical(baseline.network))
        e.push(`preserve-existing operation differs from curated baseline: ${id}`);
    }
    const op = (r.manifest.operations as Record<string, any>)[id];
    if (m.responseContract === "appcall-provider-json-v1" && op?.outputSchema?.additionalProperties !== false)
      e.push(`raw JSON output schema must reject additional properties: ${id}`);
  }
  for (const [id, m] of Object.entries(r.operationSources)) {
    const op = (r.manifest.operations as Record<string, any>)[id];
    if (!op) continue;
    if (m.responseContract === "appcall-provider-json-v1") {
      const properties = op.inputSchema?.properties;
      if (properties && typeof properties === "object") {
        try {
          const used = nativeRequestInputs(op.request, (r.manifest as any).http);
          for (const inputName of Object.keys(properties))
            if (!used.has(inputName)) e.push("unused operation input: " + inputName);
        } catch (x) {
          e.push(x instanceof Error ? x.message : String(x));
        }
      }
      if (Object.hasOwn(op.request ?? {}, "result"))
        e.push(`raw JSON operation must omit request.result: ${id}`);
      if (
        op.responseFormat !== "json" ||
        op.validationMode !== "strict-generated" ||
        op.enforceOutputSchema !== true ||
        op.outputSchema?.type !== "object" ||
        !Object.hasOwn(op.outputSchema, "properties") ||
        !Object.hasOwn(op.outputSchema.properties, "data")
      )
        e.push(`raw JSON contract is not strict and truthful: ${id}`);
    }
  }
  return e;
}
export function buildCandidate(r: ReviewedRecipe): Uint8Array {
  const e = validateRecipeSemantics(r);
  if (e.length) throw Error(`RECIPE_INVALID: ${e.join("; ")}`);
  return Buffer.from(canonical(r.manifest));
}
export async function buildRecipeCatalog(o: CatalogOptions) {
  const records: RecipeRecord[] = [];
  const candidates: Uint8Array[] = [];
  const artifacts: Record<string, BuiltArtifact> = {};
  const used = new Set<string>([
    ...(o.snapshot.existingIds ?? []),
    ...Object.keys(o.snapshot.aliases ?? {}),
  ]);
  const rs = [...o.recipes].sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );
  for (const r of rs) {
    if (used.has(r.providerId) || used.has(r.appcallId)) {
      records.push({
        providerId: r.providerId,
        appcallId: r.appcallId,
        status: "HOLD",
        reasons: ["identity collision"],
      });
      continue;
    }
    used.add(r.providerId);
    used.add(r.appcallId);
    try {
      const sourceBytes = await verifyRecipeSources(r, o.snapshot);
      const e = validateRecipeSemantics(r, o.snapshot);
      if (e.length) throw Error(e.join(";"));
      const d = evaluateRecipeSelection(r, o.asOf);
      if (d.decision !== "ADMIT") {
        records.push({
          providerId: r.providerId,
          appcallId: r.appcallId,
          status: d.decision,
          reasons: d.reasons,
          sourceRevision: r.source.revision,
          policyHash: ph(r.selection),
        });
        continue;
      }
      const c = buildCandidate(r);
      const cases = o.fixtureCases?.(r);
      if (!cases?.length) throw Error("fixture coverage absent");
      const runs = await runCandidateFixtures(c, cases);
      verifyFixtureCoverage(r, cases);
      if (runs.some((x) => x.status !== "passed"))
        throw Error("candidate fixture failed");
      candidates.push(c);
      artifacts[r.appcallId] = {
        appcallId: r.appcallId,
        recipeBytes: Buffer.from(canonical(r)),
        manifestBytes: c,
        sourceRoot: o.snapshot.root,
        sourceHashes: Object.fromEntries(
          Object.entries(sourceBytes).map(([p, b]) => [p, sha256(b)]),
        ),
        recipeDir: o.recipeDirs?.[r.providerId] ?? "",
        fixtureFiles: {},
      };
      records.push({
        providerId: r.providerId,
        appcallId: r.appcallId,
        status: "ACCEPTED",
        reasons: ["source, semantics, selection and fixtures verified"],
        candidateSha: sha256(c),
        fixture: runs,
        sourceRevision: r.source.revision,
        policyHash: ph(r.selection),
      });
    } catch (x) {
      records.push({
        providerId: r.providerId,
        appcallId: r.appcallId,
        status: "FAILED",
        reasons: [x instanceof Error ? x.message : String(x)],
      });
    }
  }
  for (const row of o.snapshot.inventory ?? [])
    if (!rs.some((r) => r.providerId === row.providerId))
      records.push({
        providerId: row.providerId,
        appcallId: row.appcallId ?? "",
        status: "HOLD",
        reasons: ["inventory provider has no recipe"],
      });
  return {
    records: records.sort((a, b) => a.providerId.localeCompare(b.providerId)),
    candidates,
    artifacts,
    asOf: o.asOf,
  };
}
