import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("loops manifest", () => {
  test("declares bearer API key, bounded Coda host, and read-only operations", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.network.allowedHosts).toEqual(["app.loops.so"]);
    expect(Object.values(manifest.operations).every((operation) => operation.sideEffect === "read")).toBe(true);
    for (const operation of Object.values(manifest.operations)) expect(operation.sideEffect).toBe("read");
  });

  test("publishes provenance and bounded execution metadata", () => {
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.evidence.live.status).toBe("unverified");
    expect(manifest.operations.healthcheck.timeoutMs).toBe(5000);
    expect(manifest.operations.healthcheck.timeoutMs).toBe(5000);
  });
});
