import { expect, test } from "bun:test";
import { reconcileNativeIdentities, normalizeIdentity, loadNativeIdentityCatalog, validateNativeIdentityCatalog } from "../native-identities";
import { PINNED_COMMIT } from "../provenance";

test("normalizes hyphens and underscores without inventing aliases", () => {
  expect(normalizeIdentity("Google-Ads")).toBe("google_ads");
  expect(normalizeIdentity("google_ads")).toBe("google_ads");
});

test("reconciles exact mappings, preserves current native IDs, and avoids double counts", () => {
  const result = reconcileNativeIdentities(
    [{ providerId: "github" }, { providerId: "google_ads" }, { providerId: "unknown_vendor" }],
    ["github", "google-ads", "stripe"],
    ["github", "google-ads", "stripe", "new-curated"],
    { google_ads: "google-ads" },
  );
  expect(result.mappings).toEqual({ google_ads: "google-ads" });
  expect(result.unmapped).toEqual(["github", "unknown_vendor"]);
  expect(result.currentCurated).toEqual(["new-curated"]);
  expect(result.nativeIds).toEqual(["github", "google-ads", "new-curated", "stripe"]);
});

test("catalog is deterministic and includes the pinned source disposition set", async () => {
  const catalog = await loadNativeIdentityCatalog();
  expect(catalog.sourceRevision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  expect(catalog.entries.length).toBe(0);
  expect(new Set(catalog.entries.map((entry) => entry.sourceId)).size).toBe(catalog.entries.length);
});

test("normalized candidates remain unmapped without reviewed evidence", () => {
  const result = reconcileNativeIdentities([{ providerId: "google_ads" }], ["google-ads"], ["google-ads"]);
  expect(result.mappings).toEqual({});
  expect(result.unmapped).toEqual(["google_ads"]);
});

test("reports baseline, current, net-new, and missing native IDs independently", () => {
  const result = reconcileNativeIdentities([{ providerId: "google_ads" }], ["github", "stripe"], ["github", "stripe", "new"], {});
  expect(result.baseline).toEqual(["github", "stripe"]);
  expect(result.current).toEqual(["github", "new", "stripe"]);
  expect(result.netNew).toEqual(["new"]);
  expect(result.missingBaseline).toEqual([]);
  expect(result.nameCandidates).toEqual([{ sourceId: "google_ads", nativeIds: [], assessment: "pending" }]);
});

test("rejects malformed runtime identity catalog entries", () => {
  expect(() => validateNativeIdentityCatalog({ sourceRevision: "x", entries: [{ sourceId: "", status: "mapped", assessment: "verified", evidence: [] }] })).toThrow("INVALID_NATIVE_IDENTITY_CATALOG");
  expect(() => validateNativeIdentityCatalog({ sourceRevision: PINNED_COMMIT, entries: [], mappings: { google_ads: "github" } })).toThrow("INVALID_NATIVE_IDENTITY_CATALOG");
});
