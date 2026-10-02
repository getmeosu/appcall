import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Workable manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("workable");
  });

  it("has version 0.2.0", () => {
    expect(manifest.version).toBe("0.2.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires bearer auth with accessToken + account", () => {
    expect(manifest.auth.type).toBe("bearer");
    const fields = manifest.auth.setup.fields.map((f: { key: string }) => f.key);
    expect(fields).toContain("accessToken");
    expect(fields).toContain("account");
  });

  // SPI base is {account}.workable.com/spi/v3 — wildcard covers tenant subdomains.
  it("allows workable subdomains", () => {
    expect(manifest.network.allowedHosts).toEqual(["*.workable.com"]);
  });

  it("declares P0 list ops including jobs.list", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "candidates.list",
      "healthcheck",
      "jobs.list",
      "members.list",
      "stages.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["stages.list"].kind).toBe("sync");
    expect(manifest.operations["members.list"].kind).toBe("sync");
  });

  it("declares job, candidate, stage, member models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "stage", "member"]);
  });
});
