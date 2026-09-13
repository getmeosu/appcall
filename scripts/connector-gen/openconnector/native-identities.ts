import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PINNED_COMMIT } from "./provenance";

export type NativeIdentityEntry = {
  sourceId: string;
  status: "mapped" | "unmapped";
  nativeId?: string;
  assessment: "verified" | "pending";
  evidence: string[];
};

export type NativeIdentityCatalog = {
  sourceRevision: string;
  entries: NativeIdentityEntry[];
  mappings?: Record<string, string>;
};

export function validateNativeIdentityCatalog(value: unknown): NativeIdentityCatalog {
  if (!value || typeof value !== "object") throw new Error("INVALID_NATIVE_IDENTITY_CATALOG");
  const catalog = value as Partial<NativeIdentityCatalog>;
  if (catalog.sourceRevision !== PINNED_COMMIT || !Array.isArray(catalog.entries)) throw new Error("INVALID_NATIVE_IDENTITY_CATALOG");
  for (const entry of catalog.entries) {
    if (!entry || typeof entry.sourceId !== "string" || !entry.sourceId || !["mapped", "unmapped"].includes(entry.status!) || !["verified", "pending"].includes(entry.assessment!) || !Array.isArray(entry.evidence) || entry.evidence.some((e) => typeof e !== "string") || (entry.status === "mapped" && typeof entry.nativeId !== "string")) throw new Error("INVALID_NATIVE_IDENTITY_CATALOG");
  }
  if (catalog.mappings && Object.keys(catalog.mappings).length) {
    for (const [sourceId, nativeId] of Object.entries(catalog.mappings)) {
      const entry = catalog.entries.find((candidate) => candidate.sourceId === sourceId);
      if (!entry || entry.status !== "mapped" || entry.assessment !== "verified" || entry.nativeId !== nativeId || entry.evidence.length === 0) throw new Error("INVALID_NATIVE_IDENTITY_CATALOG");
    }
  }
  return catalog as NativeIdentityCatalog;
}

export type IdentityReconciliation = {
  mappings: Record<string, string>;
  unmapped: string[];
  nameCandidates: Array<{ sourceId: string; nativeIds: string[]; assessment: "pending" }>;
  currentCurated: string[];
  nativeIds: string[];
  baseline: string[];
  current: string[];
  netNew: string[];
  missingBaseline: string[];
};

export function normalizeIdentity(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, "_");
}

export async function loadNativeIdentityCatalog(): Promise<NativeIdentityCatalog> {
  const path = join(dirname(fileURLToPath(import.meta.url)), "native-identities.json");
  return validateNativeIdentityCatalog(JSON.parse(await readFile(path, "utf8")));
}

export function reconcileNativeIdentities(
  sourceProviders: ReadonlyArray<{ providerId: string }>,
  existingNativeIds: Iterable<string>,
  currentNativeIds: Iterable<string>,
  explicitMappings: Record<string, string> = {},
): IdentityReconciliation {
  const existing = new Set(existingNativeIds);
  const current = new Set(currentNativeIds);
  const mappings: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const provider of [...sourceProviders].sort((a, b) => a.providerId.localeCompare(b.providerId))) {
    const reviewed = explicitMappings[provider.providerId];
    if (reviewed && existing.has(reviewed) && current.has(reviewed)) mappings[provider.providerId] = reviewed;
    else unmapped.push(provider.providerId);
  }
  const mapped = new Set(Object.values(mappings));
  const nameCandidates = [...sourceProviders].sort((a, b) => a.providerId.localeCompare(b.providerId)).map((provider) => ({
    sourceId: provider.providerId,
    nativeIds: [...existing].filter((id) => normalizeIdentity(id) === normalizeIdentity(provider.providerId)).sort(),
    assessment: "pending" as const,
  }));
  return {
    mappings,
    unmapped,
    nameCandidates,
    currentCurated: [...current].filter((id) => !existing.has(id)).sort(),
    nativeIds: [...new Set([...existing, ...current, ...mapped])].sort(),
    baseline: [...existing].sort(),
    current: [...current].sort(),
    netNew: [...current].filter((id) => !existing.has(id)).sort(),
    missingBaseline: [...existing].filter((id) => !current.has(id)).sort(),
  };
}
