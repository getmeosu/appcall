import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("coda declarative pilot", () => {
  test("declares bearer API key, bounded Coda host, and read-only operations", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.network.allowedHosts).toEqual(["coda.io"]);
    expect(Object.keys(manifest.operations)).toEqual(["healthcheck", "docs.list", "docs.get", "pages.list", "tables.list", "columns.list", "rows.list"]);
    for (const operation of Object.values(manifest.operations)) expect(operation.sideEffect).toBe("read");
  });

  test("publishes provenance and bounded execution metadata", () => {
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.evidence.live.status).toBe("unverified");
    expect(manifest.operations.healthcheck.timeoutMs).toBe(5000);
    expect(manifest.operations["rows.list"].maxResponseBytes).toBe(5242880);
    expect(manifest.operations["docs.list"].description).toContain("nextPageLink");
  });
});
