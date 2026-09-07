import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("quickbooks connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "quickbooks",
      status: "ok",
      source: "connector",
    });
  });
});
