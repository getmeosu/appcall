import { describe, expect, spyOn, test } from "bun:test";
import { createConnectorRegistry } from "../src/registry";
import { validateRegistryForStartup } from "../src/startup";

describe("runner startup", () => {
  test("logs registry validation success", () => {
    const info = spyOn(console, "info").mockImplementation(() => undefined);

    validateRegistryForStartup(createConnectorRegistry({
      manifests: [{
        key: "healthy",
        name: "Healthy",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["runner.local"] },
        operations: {
          healthcheck: { kind: "action" },
        },
      }],
      healthchecks: {
        healthy: () => ({ status: "ok" }),
      },
      actions: {
        healthy: {},
      },
    }));

    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0]?.[0] as string)).toEqual({
      component: "runner",
      event: "connector_registry_validated",
      issues: 0,
    });
  });

  test("logs registry validation failure before throwing", () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);

    const registry = createConnectorRegistry({
      manifests: [{
        key: "broken",
        name: "Broken",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["runner.local"] },
        operations: {
          "messages.send": { kind: "action" },
        },
      }],
      healthchecks: {
        broken: () => ({ status: "ok" }),
      },
      actions: {
        broken: {},
      },
    });

    expect(() => validateRegistryForStartup(registry)).toThrow("Connector registry validation failed");
    expect(error).toHaveBeenCalledTimes(1);
    const log = JSON.parse(error.mock.calls[0]?.[0] as string);
    expect(log.component).toBe("runner");
    expect(log.event).toBe("connector_registry_validation_failed");
    expect(log.issues[0].code).toBe("ACTION_HANDLER_MISSING");
  });
});
