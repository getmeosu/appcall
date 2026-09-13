import { expect, test } from "bun:test";
import { inventoryCatalog } from "../inventory";
import { PINNED_COMMIT } from "../provenance";

const sourceRoot = process.env.APPCALL_OPENCONNECTOR_SOURCE;
test.skipIf(!sourceRoot)("deterministic pinned inventory records metadata and aliases", { timeout: 30_000 }, async () => { const options = { sourceRoot: sourceRoot!, existingIds: ["app-github"], aliases: { github: "app-github" } }; const [a, b] = await Promise.all([inventoryCatalog(options), inventoryCatalog(options)]); expect(a).toEqual(b); expect(a.sourcePin).toBe(PINNED_COMMIT); expect(a.counts.providers).toBe(1498); expect(a.counts.actions).toBeGreaterThan(0); expect(a.providers.find((p) => p.providerId === "github")?.existingAppCallId).toBe("app-github"); expect(a.providers.some((p) => p.status === "HOLD")).toBe(true); });
