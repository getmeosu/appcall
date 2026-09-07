import { describe, expect, it } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("linkedin healthcheck", () => {
  it("returns ok status", () => {
    const result = healthcheck();
    expect(result.connector).toBe("linkedin");
    expect(result.status).toBe("ok");
    expect(result.source).toBe("connector");
  });
});
