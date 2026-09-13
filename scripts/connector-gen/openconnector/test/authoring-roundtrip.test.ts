import { expect, test } from "bun:test";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readRecipe } from "../recipes";
import { loadFixtureCases } from "../recipe-fixtures";
import { materializeAuthoring } from "../authoring";
import { buildRecipeCatalog } from "../recipe-build";
import { emitVerifiedCatalog } from "../recipe-emit";
import { runCandidateFixtures } from "../recipe-fixtures";
import { createHash } from "node:crypto";

test.skipIf(!process.env.APPCALL_OPENCONNECTOR_SOURCE)("reviewed Coda and Buildkite rows round-trip through native build", async () => {
  const sourceRoot = process.env.APPCALL_OPENCONNECTOR_SOURCE;
  if (!sourceRoot) return; // portable CI has no pinned checkout; live lane supplies it.
  const names = ["coda", "buildkite"];
  let total = 0;
  for (const name of names) {
    const dir = resolve("scripts/connector-gen/openconnector/recipes", name);
    const original = await readRecipe(dir);
    const cases = loadFixtureCases(join(dir, "fixtures/cases"));
    const rows = original.selection.operations.map(id => [id, (original.manifest.operations as any)[id]] as const).map(([id, operation]) => {
      const mapping = original.operationSources[id];
      return { id, upstreamActionId: mapping.upstreamActionId, sourceRefs: mapping.sourceRefs, documentationUrls: mapping.documentationUrls, responseContract: mapping.responseContract, adaptations: mapping.adaptations, operation: operation as Record<string, unknown> };
    });
    const fixtures = await Promise.all(cases.map(async c => {
      const exchanges = await Promise.all(c.exchanges.map(async (e:any) => ({ request:e.request, response:{status:e.response.status,headers:e.response.headers,body:JSON.parse(await readFile(resolve(dir,"fixtures/cases",e.response.bodyFile),"utf8"))} })));
      const expected = c.expected.kind === "success" ? JSON.parse(await readFile(resolve(dir,"fixtures/cases",c.expected.resultFile),"utf8")) : c.expected;
      return { id:c.id, operation:c.operation, input:c.input, credentials:c.credentials, evidence:c.evidence as Record<string,unknown>, exchanges, expected: c.expected.kind === "error" ? c.expected : {kind:"success", result: expected} };
    }));
    const input = { providerId:original.providerId, appcallId:original.appcallId, source:original.source, selection:original.selection, research:original.research, auth:original.manifest.auth, network:original.manifest.network, http:original.manifest.http, categories:original.manifest.categories, models:original.manifest.models, defaults:{timeoutMs:15000,maxInputBytes:65536,maxResponseBytes:5242880}, rows, fixtures } as any;
    const out = await materializeAuthoring(input);
    expect(out.recipe.providerId).toBe(name);
    const reread = await readRecipe(out.recipeDir); expect(reread.appcallId).toBe(original.appcallId);
    const built = await buildRecipeCatalog({recipes:[reread],asOf:"2026-09-13",snapshot:{root:sourceRoot},recipeDirs:{[name]:out.recipeDir},fixtureCases:()=>loadFixtureCases(join(out.recipeDir,"fixtures/cases"))});
    const row = built.records.find(r=>r.appcallId===name); expect(row?.status).toBe("ACCEPTED");
    const artifact = built.artifacts[name]; expect(artifact).toBeDefined(); const runs = await runCandidateFixtures(artifact!.manifestBytes, loadFixtureCases(join(out.recipeDir,"fixtures/cases"))); expect(runs.every(r=>r.status==="passed")).toBe(true);
    const staging = join(tmpdir(), `appcall-emitted-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`); const report = await emitVerifiedCatalog(built, staging); expect(report.accepted).toContain(name);
    const emittedManifest = await readFile(join(staging,name,"manifest.json")); const emittedCases = loadFixtureCases(join(staging,name,"fixtures/cases"));
    const emittedRuns = await runCandidateFixtures(emittedManifest, emittedCases); expect(emittedRuns).toHaveLength(fixtures.length); expect(emittedRuns.every(r=>r.status==="passed")).toBe(true);
    const emittedHash = createHash("sha256").update(emittedManifest).digest("hex"); expect(emittedRuns.every(r=>r.candidateSHA===emittedHash)).toBe(true);
    total += fixtures.length;
  }
  expect(total).toBe(14);
});
