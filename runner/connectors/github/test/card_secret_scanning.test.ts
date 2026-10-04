import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import alertFixture from "../fixtures/secret_scanning_alert.json";
import locationsFixture from "../fixtures/secret_scanning_alert_locations.json";
import orgAlertsFixture from "../fixtures/org_secret_scanning_alerts.json";
import patternsFixture from "../fixtures/secret_scanning_custom_patterns.json";
import createPatternsFixture from "../fixtures/secret_scanning_custom_pattern_create.json";
import {
  getSecretScanningAlert,
  listSecretScanningAlertLocations,
  listOrgSecretScanningAlerts,
  listSecretScanningPatterns,
  updateSecretScanningAlert,
  createSecretScanningPatterns,
} from "../src/actions";
import {
  validateGetSecretScanningAlertInput,
  validateListSecretScanningAlertLocationsInput,
  validateListOrgSecretScanningAlertsInput,
  validateListSecretScanningPatternsInput,
  validateUpdateSecretScanningAlertInput,
  validateCreateSecretScanningPatternsInput,
} from "../src/card_secret_scanning";

const READS = [
  "secret_scanning.alerts.get",
  "secret_scanning.alerts.locations.list",
  "orgs.secret_scanning.alerts.list",
  "secret_scanning.patterns.list",
] as const;

const WRITES = [
  "secret_scanning.alerts.update",
  "secret_scanning.patterns.create",
] as const;

describe("github secret scanning alert and pattern ops", () => {
  test("version is 0.44.0 at 430 ops and secret scanning policies", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(Object.keys(manifest.operations)).toHaveLength(430);
    expect(manifest.operations["secret_scanning.alerts.list"]).toBeDefined();
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    const update = manifest.operations["secret_scanning.alerts.update"] as Record<string, unknown>;
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("secret_scanning.alerts.get");
    const create = manifest.operations["secret_scanning.patterns.create"] as Record<string, unknown>;
    expect(create.sideEffect).toBe("write");
    expect(create.effectPolicy).toBe("Reconcile");
    expect(create.reconcile).toBe("secret_scanning.patterns.list");
    expect(manifest.operations["secret_scanning.alerts.get"].description).toContain(
      "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}",
    );
    expect(manifest.operations["secret_scanning.alerts.locations.list"].description).toContain(
      "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}/locations",
    );
    expect(manifest.operations["orgs.secret_scanning.alerts.list"].description).toContain(
      "GET /orgs/{org}/secret-scanning/alerts",
    );
    expect(manifest.operations["secret_scanning.patterns.list"].description).toContain(
      "GET /repos/{owner}/{repo}/secret-scanning/custom-patterns",
    );
    expect(manifest.operations["secret_scanning.alerts.update"].description).toContain(
      "PATCH /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}",
    );
    expect(manifest.operations["secret_scanning.patterns.create"].description).toContain(
      "POST /repos/{owner}/{repo}/secret-scanning/custom-patterns",
    );
    expect(manifest.operations["orgs.secret_scanning.patterns.update"]).toBeUndefined();
    expect(manifest.operations["enterprises.secret_scanning.alerts.list"]).toBeUndefined();
    for (const key of [...READS, ...WRITES]) {
      expect(schemaKeys(manifest.operations[key].outputSchema)).not.toContain("secret");
    }
  });

  test("validates path fields, resolution, and pattern payloads", () => {
    expect(validateGetSecretScanningAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 8,
    })).toEqual({ owner: "octocat", repo: "Hello-World", alertNumber: 8 });
    expect(() => validateGetSecretScanningAlertInput({ owner: "octo/cat", repo: "Hello-World", alertNumber: 8 })).toThrow(/owner/);
    expect(() => validateGetSecretScanningAlertInput({ owner: "octocat", repo: "Hello-World", alertNumber: 0 })).toThrow(/alertNumber/);
    expect(validateListSecretScanningAlertLocationsInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 8,
      perPage: 30,
      page: 2,
    })).toEqual({ owner: "octocat", repo: "Hello-World", alertNumber: 8, perPage: 30, page: 2 });
    expect(validateListOrgSecretScanningAlertsInput({ org: "octocat", perPage: 10, page: 1, state: "open" })).toEqual({
      org: "octocat",
      perPage: 10,
      page: 1,
      state: "open",
    });
    expect(() => validateListOrgSecretScanningAlertsInput({ org: "octo/cat" })).toThrow(/org/);
    expect(() => validateListOrgSecretScanningAlertsInput({ org: "octocat", state: "dismissed" })).toThrow(/state/);
    expect(validateListSecretScanningPatternsInput({ owner: "octocat", repo: "Hello-World" })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      perPage: undefined,
      page: undefined,
    });
    expect(validateUpdateSecretScanningAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 8,
      state: "resolved",
      resolution: "false_positive",
      resolutionComment: "noise",
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 8,
      state: "resolved",
      resolution: "false_positive",
      resolutionComment: "noise",
    });
    expect(() => validateUpdateSecretScanningAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 8,
      state: "resolved",
    })).toThrow(/resolution/);
    expect(() => validateUpdateSecretScanningAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 8,
      state: "open",
      resolution: "revoked",
    })).toThrow(/resolution/);
    expect(validateCreateSecretScanningPatternsInput({
      owner: "octocat",
      repo: "Hello-World",
      patterns: [{ name: "Service token", pattern: "svc_[A-Za-z0-9]{24}" }],
    }).patterns).toEqual([{ name: "Service token", pattern: "svc_[A-Za-z0-9]{24}" }]);
    expect(() => validateCreateSecretScanningPatternsInput({
      owner: "octocat",
      repo: "Hello-World",
      patterns: [],
    })).toThrow(/patterns/);
  });

  test("gets a repo alert and lists locations without leaking the secret", async () => {
    const seen: string[] = [];
    const alert = await getSecretScanningAlert({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      alertNumber: 8,
      fetch: async (input, init) => {
        seen.push(`${init?.method ?? "GET"} ${String(input)}`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer t");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return json(alertFixture);
      },
    });
    expect(alert.action).toBe("secret_scanning.alerts.get");
    expect(alert.alert).toEqual({
      number: 8,
      state: "open",
      secretType: "github_personal_access_token",
      htmlUrl: "https://github.com/acme/app/security/secret-scanning/8",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(JSON.stringify(alert)).not.toContain("should-not-leak");
    expect(JSON.stringify(alert)).not.toContain("drop-me");
    expect((alert.alert as { secret?: unknown }).secret).toBeUndefined();

    const locations = await listSecretScanningAlertLocations({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      alertNumber: 8,
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        seen.push(`${init?.method ?? "GET"} ${String(input)}`);
        return json(locationsFixture);
      },
    });
    expect(locations.action).toBe("secret_scanning.alerts.locations.list");
    expect((locations.locations as { type: string; path: string }[])[0]).toEqual({
      type: "commit",
      path: "config/secrets.env",
      startLine: 4,
      endLine: 4,
      commitSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      htmlUrl: "https://github.com/acme/app/blob/deadbeef/config/secrets.env#L4",
    });
    expect(JSON.stringify(locations)).not.toContain("should-not-leak");
    expect(seen).toEqual([
      "GET https://api.github.com/repos/octo%20cat/Hello%20World/secret-scanning/alerts/8",
      "GET https://api.github.com/repos/octo%20cat/Hello%20World/secret-scanning/alerts/8/locations?per_page=30&page=2",
    ]);
  });

  test("lists org alerts and repo custom patterns", async () => {
    const org = await listOrgSecretScanningAlerts({
      accessToken: "t",
      org: "octo cat",
      state: "open",
      perPage: 10,
      page: 1,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/secret-scanning/alerts?state=open&per_page=10&page=1");
        expect(String(input)).not.toContain("/enterprises/");
        expect(init?.method ?? "GET").toBe("GET");
        return json(orgAlertsFixture);
      },
    });
    expect(org.action).toBe("orgs.secret_scanning.alerts.list");
    expect((org.alerts as { number: number; repositoryFullName: string }[])[0]).toMatchObject({
      number: 3,
      secretType: "npm_access_token",
      repositoryFullName: "acme/app",
    });
    expect(JSON.stringify(org)).not.toContain("should-not-leak");

    const patterns = await listSecretScanningPatterns({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/secret-scanning/custom-patterns");
        return json(patternsFixture);
      },
    });
    expect(patterns.action).toBe("secret_scanning.patterns.list");
    expect((patterns.patterns as { id: number; name: string }[])[0]).toEqual({
      id: 12,
      name: "Internal token",
      pattern: "acme_[A-Za-z0-9]{32}",
      slug: "internal-token",
      state: "published",
      pushProtectionEnabled: true,
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: "2026-01-06T00:00:00Z",
    });
    expect(JSON.stringify(patterns)).not.toContain("drop-me");
  });

  test("patches an alert and posts repo custom patterns", async () => {
    const requests: Request[] = [];
    const updated = await updateSecretScanningAlert({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      alertNumber: 8,
      state: "resolved",
      resolution: "false_positive",
      resolutionComment: "noise",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json({ ...alertFixture, state: "resolved", resolution: "false_positive" });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/secret-scanning/alerts/8");
    expect(JSON.parse(await requests[0].text())).toEqual({
      state: "resolved",
      resolution: "false_positive",
      resolution_comment: "noise",
    });
    expect((updated.alert as { state: string }).state).toBe("resolved");
    expect(JSON.stringify(updated)).not.toContain("should-not-leak");

    const created = await createSecretScanningPatterns({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      patterns: [{ name: "Service token", pattern: "svc_[A-Za-z0-9]{24}" }],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(createPatternsFixture, 201);
      },
    });
    expect(requests[1].method).toBe("POST");
    expect(requests[1].url).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/secret-scanning/custom-patterns");
    expect(JSON.parse(await requests[1].text())).toEqual({
      patterns: [{ name: "Service token", pattern: "svc_[A-Za-z0-9]{24}" }],
    });
    expect(created.action).toBe("secret_scanning.patterns.create");
    expect((created.patterns as { id: number; name: string }[])[0]).toMatchObject({
      id: 13,
      name: "Service token",
      slug: "service-token",
    });
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getSecretScanningAlert({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 1,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = async () => new Response("{}", { status: 404 });
    await expect(getSecretScanningAlert({ accessToken: "t", owner: "octocat", repo: "Hello-World", alertNumber: 1, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listSecretScanningAlertLocations({ accessToken: "t", owner: "octocat", repo: "Hello-World", alertNumber: 1, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgSecretScanningAlerts({ accessToken: "t", org: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listSecretScanningPatterns({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(updateSecretScanningAlert({ accessToken: "t", owner: "octocat", repo: "Hello-World", alertNumber: 1, state: "open", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createSecretScanningPatterns({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      patterns: [{ name: "x", pattern: "y" }],
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = getSecretScanningAlert({ owner: "octocat", repo: "Hello-World", alertNumber: 8 });
    expect(result.action).toBe("secret_scanning.alerts.get");
    expect(result.validated).toEqual({ owner: "octocat", repo: "Hello-World", alertNumber: 8 });
  });
});

function schemaKeys(schema: unknown, acc: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return acc;
  const record = schema as { properties?: Record<string, unknown>; items?: unknown };
  if (record.properties) {
    for (const [key, value] of Object.entries(record.properties)) {
      acc.push(key);
      schemaKeys(value, acc);
    }
  }
  if (record.items) schemaKeys(record.items, acc);
  return acc;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
