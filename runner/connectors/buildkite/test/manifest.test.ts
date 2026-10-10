import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("buildkite manifest", () => {
  it("keeps the bounded public bearer contract", () => {
    expect(manifest.key).toBe("buildkite");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.network.allowedHosts).toEqual(["api.buildkite.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const [key, op] of Object.entries(manifest.operations) as Array<[string, Record<string, unknown>]>) {
      expect(["read", "write", "destructive"]).toContain(op.sideEffect);
      if (key.startsWith("webhook.")) {
        expect(op.kind).toBe("webhook");
        continue;
      }
      expect(op.kind).toBe("action");
      expect(op.enforceOutputSchema).toBe(true);
    }
  });
});
