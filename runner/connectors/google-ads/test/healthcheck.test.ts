import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("google-ads connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "google-ads",
      status: "ok",
      source: "connector",
    });
  });
});
