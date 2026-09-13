import { describe, expect, test } from "bun:test";
import { decideSelection, type SelectionRegistry } from "../selection";

const SHA = "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a";
const base = (overrides: Record<string, unknown> = {}) => ({
  providerId: "coda",
  appcallId: "coda",
  disposition: "APPROVED",
  edition: "international",
  operations: ["list-docs"],
  upstreamSha: SHA,
  marketFocus: "international",
  research: { reviewedAt: "2026-09-12", reviewer: "reviewer-1", sources: ["https://example.com/research"], searchCoverage: "official incidents and independent reporting" },
  breach: { status: "none-found", researchedAt: "2026-09-12" },
  quality: { usefulness: 4, api: 4, auth: 4, maintainability: 4, testability: 4 },
  gates: { license: true, credentials: true, officialApi: true, boundedNetwork: true, operationQuality: true },
  ...overrides,
});

const registry = (entries = [base()]): SelectionRegistry => ({ entries });
const req = (extra: Record<string, unknown> = {}) => ({ providerId: "coda", edition: "international", operationId: "list-docs", upstreamSha: SHA, asOf: "2026-09-12", ...extra });

describe("decideSelection", () => {
  test("admits an exact pinned, researched, qualified operation", () => {
    expect(decideSelection(registry(), req())).toMatchObject({ decision: "ADMIT" });
  });
  test("holds unknown, malformed or missing evidence", () => {
    expect(decideSelection(registry([]), req({ providerId: "unknown" })).decision).toBe("HOLD");
    for (const entry of [base({ research: undefined }), base({ research: { sources: [] } }), base({ research: { reviewedAt: "2026-02-30", reviewer: "x", sources: ["bad"], searchCoverage: "x" } })]) expect(decideSelection(registry([entry]), req()).decision).toBe("HOLD");
  });
  test("rejects mainland editions, revision mismatches and unselected operations", () => {
    expect(decideSelection(registry([base({ edition: "mainland-china", marketFocus: "mainland-china", disposition: "HOLD" })]), req({ edition: "mainland-china" })).decision).toBe("EXCLUDE");
    expect(decideSelection(registry(), req({ upstreamSha: "bad" })).decision).toBe("HOLD");
    expect(decideSelection(registry(), req({ operationId: "write-doc" })).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ gates: {} as never, quality: {} as never })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ breach: { status: "mystery" as never, researchedAt: "2026-09-12" } })]), req()).decision).toBe("HOLD");
  });
  test("excludes confirmed old breaches without an exact exception and holds unresolved compromise", () => {
    const old = base({ breach: { status: "confirmed", researchedAt: "2026-09-12" } });
    expect(decideSelection(registry([old]), req()).decision).toBe("EXCLUDE");
    const unresolved = base({ breach: { status: "unresolved", researchedAt: "2026-09-12" }, exception: { kind: "popular", authority: "x" } });
    expect(decideSelection(registry([unresolved]), req()).decision).toBe("HOLD");
  });
  test("allows international Chinese-owned products and exact TikTok exception only", () => {
    const china = base({ ownership: "china" });
    expect(decideSelection(registry([china]), req()).decision).toBe("ADMIT");
    const tiktok = base({ providerId: "tiktok_business", appcallId: "tiktok-ads", breach: { status: "confirmed", researchedAt: "2026-09-12" }, exception: { kind: "tiktok", authority: "user", productIds: ["tiktok_business"], operationIds: ["list-docs"], adoption: "demand", usefulness: "useful", incident: "reviewed", remediation: "documented", residualRisk: "bounded" } as never });
    expect(decideSelection(registry([tiktok]), req({ providerId: "tiktok_business" })).decision).toBe("ADMIT");
    const sibling = { ...tiktok, providerId: "tiktok-shop", appcallId: "tiktok-shop" };
    expect(decideSelection(registry([sibling]), req({ providerId: "tiktok-shop" })).decision).toBe("EXCLUDE");
  });
  test("rejects duplicate aliases and weak scores", () => {
    expect(decideSelection({ entries: [base({ aliases: ["coda"] }), base({ providerId: "other", aliases: ["coda"] })] }, req()).decision).toBe("HOLD");
    expect(decideSelection({ entries: [base(), base()] }, req()).decision).toBe("HOLD");
    expect(decideSelection({ entries: [null as never] }, req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ disposition: "HOLD" })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ quality: { foo: 4 } as never })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ gates: { foo: true } as never })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ quality: { a: 4, b: 4, c: 4, d: 4, e: 4 } as never, gates: { a: true, b: true, c: true, d: true, e: true } as never })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ research: { reviewedAt: "2026-99-99", reviewer: "x", sources: ["https://x"], searchCoverage: "x" } })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ aliases: {} as never })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ disposition: "EXCLUDE" })]), req()).decision).toBe("EXCLUDE");
    expect(decideSelection(registry([base({ exception: { kind: "tiktok", authority: "x", productIds: "tiktok_business", operationIds: "list-docs", adoption: "x", usefulness: "x", incident: "x", remediation: "x", residualRisk: "x" } as never, breach: { status: "confirmed", researchedAt: "2026-09-12" } })]), req()).decision).toBe("EXCLUDE");
    expect(decideSelection(registry([base({ providerId: "service", appcallId: "service", exception: { kind: "other", authority: "x", productIds: ["service"], operationIds: ["list-docs"], adoption: "x", usefulness: "x", incident: "x", remediation: "x", residualRisk: "x" }, breach: { status: "confirmed", researchedAt: "2026-09-12" } })]), req({ providerId: "service" })).decision).toBe("ADMIT");
    expect(decideSelection(registry([base({ quality: { usefulness: 5, api: 5, auth: 2, maintainability: 5, testability: 5 } })]), req()).decision).toBe("HOLD");
    expect(decideSelection(registry([base({ breach: { status: "confirmed", researchedAt: "2026-09-12" }, exception: { kind: "popular", authority: "x", evidence: ["1", "2", "3", "4", "5"] } })]), req()).decision).toBe("EXCLUDE");
  });
});
