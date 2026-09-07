import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("xero connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "xero",
      status: "ok",
      source: "connector",
    });
  });
});
