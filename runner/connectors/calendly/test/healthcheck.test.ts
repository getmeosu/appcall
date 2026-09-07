import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("calendly connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "calendly",
      status: "ok",
      source: "connector",
    });
  });
});
