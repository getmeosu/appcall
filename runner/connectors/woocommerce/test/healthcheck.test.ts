import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("woocommerce connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "woocommerce",
      status: "ok",
      source: "connector",
    });
  });
});
