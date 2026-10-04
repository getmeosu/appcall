import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("coda declarative pilot", () => {
  test("declares bearer API key, bounded Coda host, and mixed read/write operations", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.network.allowedHosts).toEqual(["coda.io"]);
    expect(manifest.version).toBe("0.2.0");
    expect(Object.keys(manifest.operations)).toEqual([
      "healthcheck",
      "docs.list",
      "docs.get",
      "pages.list",
      "tables.list",
      "columns.list",
      "rows.list",
      "docs.create",
      "pages.get",
      "pages.create",
      "tables.get",
      "columns.get",
      "rows.get",
      "rows.insert",
      "rows.update",
      "rows.delete",
      "formulas.list",
      "controls.list",
      "mutations.get",
      "automations.trigger",
    ]);
    expect(manifest.operations.healthcheck.sideEffect).toBe("read");
    expect(manifest.operations["rows.insert"].sideEffect).toBe("write");
    expect(manifest.operations["rows.delete"].sideEffect).toBe("destructive");
  });

  test("publishes provenance and bounded execution metadata", () => {
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.evidence.live.status).toBe("unverified");
    expect(manifest.operations.healthcheck.timeoutMs).toBe(5000);
    expect(manifest.operations["rows.list"].maxResponseBytes).toBe(5242880);
    expect(manifest.operations["docs.list"].description).toContain("nextPageLink");
  });
});
