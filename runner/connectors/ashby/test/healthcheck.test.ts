import { describe, expect, it } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("Ashby healthcheck", () => {
  it("returns ok status", () => {
    const result = healthcheck();
    expect(result.connector).toBe("ashby");
    expect(result.status).toBe("ok");
    expect(result.source).toBe("connector");
  });
});
