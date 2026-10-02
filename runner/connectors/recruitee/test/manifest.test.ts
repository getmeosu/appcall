import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Recruitee manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("recruitee");
  });

  it("has version 0.2.0", () => {
    expect(manifest.version).toBe("0.2.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires bearer auth with company + accessToken", () => {
    expect(manifest.auth.type).toBe("bearer");
    const fields = manifest.auth.setup.fields.map((f: { key: string }) => f.key);
    expect(fields).toContain("company");
    expect(fields).toContain("accessToken");
  });

  // Careers jobs hit {company}.recruitee.com; ATS lists hit api.recruitee.com.
  // Wildcard covers tenant subdomains; api.recruitee.com is listed explicitly.
  it("allows recruitee subdomains and api.recruitee.com", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "*.recruitee.com",
      "api.recruitee.com",
    ]);
  });

  it("declares P0 list ops including careers jobs.list", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "candidates.list",
      "healthcheck",
      "jobs.list",
      "offers.list",
      "pipeline_stages.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["offers.list"].kind).toBe("sync");
    expect(manifest.operations["pipeline_stages.list"].kind).toBe("sync");
  });

  it("declares job, candidate, offer, pipeline_stage models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "offer", "pipeline_stage"]);
  });
});
