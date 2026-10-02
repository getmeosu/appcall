import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("googlemeet connector manifest", () => {
  test("declares external_bearer auth and core operations", () => {
    expect(manifest.key).toBe("googlemeet");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("external_bearer");
    expect(manifest.auth.setup.mode).toBe("external_bearer");
    expect(manifest.network.allowedHosts).toContain("www.googleapis.com");
    expect(manifest.operations["meetings.create"].kind).toBe("action");
    expect(manifest.operations["meetings.list"].kind).toBe("action");
    expect(manifest.operations["meetings.get"].kind).toBe("action");
    expect(manifest.operations["meetings.update"].kind).toBe("action");
    expect(manifest.operations["meetings.delete"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("thin slice declares get/update/delete with samples", () => {
    expect(manifest.operations["meetings.get"].sample).toBeDefined();
    expect(manifest.operations["meetings.update"].sample).toBeDefined();
    expect(manifest.operations["meetings.delete"].sample).toBeDefined();
    expect(manifest.operations["meetings.create"].sample).toBeDefined();
  });

  test("operation count is 6 including healthcheck", () => {
    expect(Object.keys(manifest.operations)).toHaveLength(6);
  });
});
