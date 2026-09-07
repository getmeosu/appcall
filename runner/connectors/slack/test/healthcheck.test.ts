import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("slack connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "slack",
      status: "ok",
      source: "connector",
    });
  });
});
