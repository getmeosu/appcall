import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("buttondown manifest", () => {
  test("declares API key auth, bounded host, and version 0.2.0", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.network.allowedHosts).toEqual(["api.buttondown.com"]);
    expect(manifest.version).toBe("0.2.0");
  });

  test("publishes provenance and EventOnly webhooks as reads", () => {
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.evidence.live.status).toBe("unverified");
    for (const [key, operation] of Object.entries(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(operation.kind).toBe("webhook");
        expect(operation.sideEffect).toBe("read");
      }
    }
  });
});
