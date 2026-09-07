import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("shopify connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "shopify",
      status: "ok",
      source: "connector",
    });
  });
});
