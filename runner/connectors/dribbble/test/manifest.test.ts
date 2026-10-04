import { expect, it } from "bun:test";
import manifest from "../manifest.json";
it("declares manual bearer setup and recipe operations", () => {
  expect(manifest.auth.type).toBe("bearer");
  expect(manifest.auth.setup.mode).toBe("api_key");
  expect(manifest.http.baseUrl).toBe("https://api.dribbble.com/v2");
  expect(manifest.version).toBe("0.2.0");
  expect(Object.keys(manifest.operations).length).toBeGreaterThanOrEqual(16);
});
