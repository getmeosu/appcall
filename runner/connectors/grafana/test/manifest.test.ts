import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("keeps origin Grafana auth and adds the documented JSON routes", () => {
  expect(manifest.version).toBe("0.2.1");
  expect("full_depth" in manifest).toBe(false);
  expect(Object.keys(manifest.operations)).toHaveLength(25);
  expect(manifest.http.baseUrl).toBe("https://{{stack}}.grafana.net");
  expect(manifest.network.allowedHosts).toEqual(["*.grafana.net"]);
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey", "stack"]);
  const stack = manifest.auth.setup.fields.find((field: { key: string }) => field.key === "stack");
  expect(stack).toEqual({
    key: "stack",
    label: "Grafana Cloud stack slug",
    required: true,
    secret: false,
  });
  expect(JSON.stringify(manifest)).not.toContain("base_url_override");

  const operations = manifest.operations as Record<string, {
    kind: string;
    sideEffect: string;
    timeoutMs: number;
    maxInputBytes: number;
    maxResponseBytes: number;
    request: { method: string; path: string; success: number[]; body?: unknown; headers?: Record<string, string> };
  }>;

  expect(operations.healthcheck!.request).toEqual({ method: "GET", path: "/api/org", success: [200] });
  expect(operations.healthcheck!.request.body).toBeUndefined();
  expect(operations.healthcheck!.request.headers).toBeUndefined();

  expect(operations["health.get"]!.request).toEqual({ method: "GET", path: "/api/health", success: [200] });
  expect(operations["health.get"]!.request.body).toBeUndefined();
  expect(operations["health.get"]!.request.headers).toBeUndefined();
  expect(operations["health.get"]!.sideEffect).toBe("read");

  expect(operations["signingKeys.retrieve"]!.request).toEqual({ method: "GET", path: "/api/signing-keys/keys", success: [200] });
  expect(operations["signingKeys.retrieve"]!.request.body).toBeUndefined();
  expect(operations["signingKeys.retrieve"]!.request.headers).toBeUndefined();
  expect(operations["signingKeys.retrieve"]!.sideEffect).toBe("read");

  const query = operations["publicDashboards.query"]!;
  expect(query.sideEffect).toBe("read");
  expect(query.request.method).toBe("POST");
  expect(query.request.path).toBe("/api/public/dashboards/{{accessToken}}/panels/{{panelId}}/query");
  expect(query.request.success).toEqual([200]);
  expect(query.request.headers).toEqual({ "Content-Type": "application/json" });
  expect(query.request.body).toEqual({
    intervalMs: "{{intervalMs}}",
    maxDataPoints: "{{maxDataPoints}}",
    queryCachingTTL: "{{queryCachingTTL}}",
    timeRange: {
      from: "{{timeRange.from}}",
      to: "{{timeRange.to}}",
      timezone: "{{timeRange.timezone}}",
    },
  });

  for (const op of Object.values(operations)) {
    expect(op.timeoutMs).toBeGreaterThanOrEqual(1);
    expect(op.timeoutMs).toBeLessThanOrEqual(300000);
    expect(op.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    if (op.request.method === "GET" || op.request.method === "DELETE") {
      expect(op.request.body).toBeUndefined();
      expect(op.request.headers?.["Content-Type"]).toBeUndefined();
    }
    if (op.request.body !== undefined) {
      expect(op.request.headers?.["Content-Type"]).toBe("application/json");
    }
  }
});
