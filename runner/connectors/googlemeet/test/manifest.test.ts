import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("googlemeet connector manifest", () => {
  test("declares external_bearer auth and core operations", () => {
    expect(manifest.key).toBe("googlemeet");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("external_bearer");
    expect(manifest.auth.setup.mode).toBe("external_bearer");
    expect(manifest.network.allowedHosts).toContain("www.googleapis.com");
    expect(manifest.operations["meetings.create"].kind).toBe("action");
    expect(manifest.operations["meetings.list"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("meetings.create carries a sample for the guided form", () => {
    expect(manifest.operations["meetings.create"].sample).toBeDefined();
  });
});
