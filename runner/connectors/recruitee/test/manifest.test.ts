import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Recruitee manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("recruitee");
  });

  it("has version 0.4.0", () => {
    expect(manifest.version).toBe("0.4.0");
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

  it("declares P0+P1 ops plus the L2 declarative backlog", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "candidates.create",
      "candidates.delete",
      "candidates.get",
      "candidates.list",
      "candidates.notes.create",
      "candidates.notes.list",
      "candidates.search",
      "candidates.update",
      "company.get",
      "departments.list",
      "eeo.job_categories.list",
      "healthcheck",
      "interview_events.list",
      "invoices.list",
      "jobs.list",
      "localization_settings.get",
      "locations.list",
      "offers.create",
      "offers.list",
      "offers.public.get",
      "offers.update",
      "pipeline_stages.list",
      "share.countries.list",
      "share.eeo.answers.list",
      "tags.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.get"].kind).toBe("sync");
    expect(manifest.operations["candidates.search"].kind).toBe("sync");
    expect(manifest.operations["interview_events.list"].kind).toBe("sync");
    expect(manifest.operations["offers.list"].kind).toBe("sync");
    expect(manifest.operations["pipeline_stages.list"].kind).toBe("sync");
    for (const key of [
      "candidates.create",
      "candidates.update",
      "candidates.delete",
      "candidates.notes.create",
      "candidates.notes.list",
      "company.get",
      "departments.list",
      "eeo.job_categories.list",
      "invoices.list",
      "localization_settings.get",
      "locations.list",
      "offers.create",
      "offers.public.get",
      "offers.update",
      "share.countries.list",
      "share.eeo.answers.list",
      "tags.list",
    ]) {
      const operation = manifest.operations[key as keyof typeof manifest.operations] as {
        kind?: string;
        request?: { method?: string; path?: string };
      };
      expect(operation.kind).toBe("action");
      expect(operation.request?.method).toBeTruthy();
      expect(operation.request?.path).toBeTruthy();
    }
  });

  it("declares the ATS API base URL and bearer header", () => {
    expect(manifest.http.baseUrl).toBe("https://api.recruitee.com/c/{{company}}");
    expect(manifest.http.auth).toEqual({
      field: "accessToken",
      in: "header",
      name: "Authorization",
      value: "Bearer {{accessToken}}",
    });
  });

  it("declares job, candidate, offer, pipeline_stage, interview_event models", () => {
    expect(manifest.models).toEqual([
      "job",
      "candidate",
      "offer",
      "pipeline_stage",
      "interview_event",
    ]);
  });
});
