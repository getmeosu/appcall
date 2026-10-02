import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Workable manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("workable");
  });

  it("has version 0.3.0", () => {
    expect(manifest.version).toBe("0.3.0");
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

  it("declares P0/P1 list+get ops including jobs.get/candidates.get/events.list", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "candidates.get",
      "candidates.list",
      "events.list",
      "healthcheck",
      "jobs.get",
      "jobs.list",
      "members.list",
      "stages.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["jobs.get"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.get"].kind).toBe("sync");
    expect(manifest.operations["stages.list"].kind).toBe("sync");
    expect(manifest.operations["members.list"].kind).toBe("sync");
    expect(manifest.operations["events.list"].kind).toBe("sync");
  });

  it("declares job, candidate, stage, member, event models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "stage", "member", "event"]);
  });
});
