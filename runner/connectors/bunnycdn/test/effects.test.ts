import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

// FX-bunnycdn-2: deletes that permanently remove a bunny.net resource are
// sideEffect destructive with no effect keys; the 3 pull-zone list removes are
// reversible with their add* counterpart and stay write.
// Per-op citations: parity-briefs/fx2-greenhouse-slack-bunnycdn-selflock.md.

type Op = { kind?: string; sideEffect?: string; effectPolicy?: string; reconcile?: string; reconcileInput?: unknown; request?: { method?: string } };
const ops = manifest.operations as unknown as Record<string, Op>;

const DESTRUCTIVE = [
  "databases.delete",
  "databases.groups.delete",
  "dnszones.delete",
  "dnszones.records.delete",
  "mc.registries.delete",
  "pullzones.delete",
  "pullzones.edgeRules.delete",
  "shield.accessLists.delete",
  "storagezones.delete",
] as const;

const REVERSIBLE_REMOVES = {
  "pullzones.removeAllowedReferer": "pullzones.addAllowedReferer",
  "pullzones.removeBlockedIp": "pullzones.addBlockedIp",
  "pullzones.removeBlockedReferer": "pullzones.addBlockedReferer",
} as const;

describe("FX-bunnycdn-2 effects", () => {
  it("has version 0.3.2", () => {
    expect(manifest.version).toBe("0.3.2");
  });

  it("pins the destructive set exactly", () => {
    const destructive = Object.entries(ops)
      .filter(([, op]) => op.sideEffect === "destructive")
      .map(([key]) => key)
      .sort();
    expect(destructive).toEqual([...DESTRUCTIVE].sort());
  });

  it("the 9 deletes are HTTP DELETEs with no effect keys", () => {
    for (const key of DESTRUCTIVE) {
      const op = ops[key]!;
      expect(op.kind, key).toBe("action");
      expect(op.request?.method, key).toBe("DELETE");
      expect(op.effectPolicy, key).toBeUndefined();
      expect(op.reconcile, key).toBeUndefined();
      expect(op.reconcileInput, key).toBeUndefined();
    }
  });

  it("every *.delete action is destructive", () => {
    for (const [key, op] of Object.entries(ops)) {
      if (op.kind === "action" && /\.delete$/.test(key)) expect(op.sideEffect, key).toBe("destructive");
    }
  });

  it("the 3 remove-from-list ops stay write and their add counterpart exists", () => {
    for (const [key, add] of Object.entries(REVERSIBLE_REMOVES)) {
      expect(ops[key]!.sideEffect, key).toBe("write");
      expect(ops[key]!.effectPolicy, key).toBeUndefined();
      expect(ops[add]?.sideEffect, add).toBe("write");
    }
  });
});
