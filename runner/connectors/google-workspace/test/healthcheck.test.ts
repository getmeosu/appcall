import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("google-workspace connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "google-workspace",
      status: "ok",
      source: "connector",
    });
  });
});
