import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("salesforce connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "salesforce",
      status: "ok",
      source: "connector",
    });
  });
});
