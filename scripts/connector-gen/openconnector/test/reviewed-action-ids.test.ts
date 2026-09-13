import { expect, test } from "bun:test";
import { reviewedIds } from "../reviewed-action-ids";
import { sha256 } from "../provenance";
import { verifyRecipeSources } from "../recipe-build";

const commit = "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a";
const path = "src/providers/new_relic/actions.ts";
const hash = "e8bac29a8e6ebc21fe0dec471827eab2afcc960565f223eb7a424ef656527b6a";

test("matches the exact reviewed New Relic tuple", () => {
  expect(reviewedIds("new_relic", commit, path, hash)).toEqual(["get_alert_policies"]);
  expect(reviewedIds("other", commit, path, hash)).toBeUndefined();
  expect(reviewedIds("new_relic", "wrong", path, hash)).toBeUndefined();
  expect(reviewedIds("new_relic", commit, "wrong", hash)).toBeUndefined();
  expect(reviewedIds("new_relic", commit, path, "0".repeat(64))).toBeUndefined();
});

test("pinned New Relic source hash is independently reproducible", async () => {
  const root = process.env.APPCALL_OPENCONNECTOR_SOURCE;
  if (!root) return;
  const bytes = await Bun.file(`${root}/${path}`).arrayBuffer();
  expect(sha256(new Uint8Array(bytes))).toBe(hash);
  expect(reviewedIds("new_relic", commit, path, sha256(new Uint8Array(bytes)))).toEqual(["get_alert_policies"]);
});

test.skipIf(!process.env.APPCALL_OPENCONNECTOR_SOURCE)("recipe source verification accepts reviewed action and rejects unknown operation", async () => {
  const root = process.env.APPCALL_OPENCONNECTOR_SOURCE!;
  const bytes = await Bun.file(`${root}/${path}`).arrayBuffer();
  const recipe = { providerId: "new_relic", source: { url: "https://github.com/oomol-lab/open-connector.git", revision: commit, files: { [path]: hash }, spans: {} }, operationSources: { current: { upstreamActionId: "get_alert_policies", responseContract: "preserve-existing", sourceRefs: [], documentationUrls: [], adaptations: [] } } } as any;
  await expect(verifyRecipeSources(recipe, { root })).resolves.toBeDefined();
  recipe.operationSources.current.upstreamActionId = "unknown_action";
  await expect(verifyRecipeSources(recipe, { root })).rejects.toThrow("upstream action does not exist");
  recipe.operationSources.current.upstreamActionId = "get_alert_policies";
  recipe.source.revision = "0".repeat(40);
  await expect(verifyRecipeSources(recipe, { root })).rejects.toThrow("PIN_MISMATCH");
  recipe.source.revision = commit;
  recipe.source.files[path] = "0".repeat(64);
  await expect(verifyRecipeSources(recipe, { root })).rejects.toThrow("HASH_MISMATCH");
});
