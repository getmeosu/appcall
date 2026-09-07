import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("zoom connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "zoom",
      status: "ok",
      source: "connector",
    });
  });
});
