import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const realm = { accessToken: "fixture-token", realmId: "9341452710" };
const base = "https://quickbooks.api.intuit.com/v3/company/9341452710";

describe("quickbooks declarative actions", () => {
  it("compiles every action including healthcheck and keeps sync keys", () => {
    const actionKeys = Object.keys(manifest.operations).filter((key) => manifest.operations[key as keyof typeof manifest.operations].kind === "action");
    expect(Object.keys(actions).sort()).toEqual(actionKeys.sort());
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["customers.list"].kind).toBe("sync");
    expect(manifest.operations["payments.list"].kind).toBe("sync");
    expect(manifest.version).toBe("0.2.0");
  });

  for (const c of cases) {
    describe(c.op, () => {
      it("echoes declared input without credentials", async () => {
        expect(actions[c.op]).toBeFunction();
        const result = await actions[c.op]!(c.input);
        expect(result).toMatchObject(c.op === "healthcheck" ? { status: "ok" } : { validated: c.input });
      });

      it("uses the documented request and maps provider output", async () => {
        let calls = 0;
        const result = await actions[c.op]!({
          ...c.input,
          ...realm,
          fetch: async (url: unknown, init?: RequestInit) => {
            calls++;
            const got = new URL(String(url));
            const expected = new URL(base + c.path);
            expect(got.origin + got.pathname).toBe(expected.origin + expected.pathname);
            expect([...got.searchParams.entries()]).toEqual([...expected.searchParams.entries()]);
            expect(init?.method).toBe(c.method);
            const headers = new Headers(init?.headers);
            expect(headers.get("Authorization")).toBe("Bearer fixture-token");
            expect(headers.get("Accept")).toBe("application/json");
            expect(init?.body === undefined ? null : JSON.parse(String(init.body))).toEqual(c.body);
            return new Response(JSON.stringify(c.response), { status: c.status });
          },
        });
        expect(calls).toBe(1);
        expect(result).toMatchObject({ connector: "quickbooks", action: c.op, source: "provider", ...c.output });
      });

      it("returns a typed upstream failure", async () => {
        await expect(
          actions[c.op]!({
            ...c.input,
            ...realm,
            fetch: async () => new Response('{"Fault":{"Error":[{"Message":"Forbidden"}]}}', { status: 403 }),
          }),
        ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
      });
    });
  }

  it("honors Retry-After for throttling", async () => {
    await expect(
      actions.healthcheck!({
        ...realm,
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "17" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });

  it("rejects undeclared input fields", async () => {
    await expect(
      actions.healthcheck!({
        ...realm,
        unexpected: "ignored",
        fetch: async () => new Response("{}"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  it("rejects missing write identifiers before dispatch", async () => {
    let called = false;
    await expect(
      actions["customers.update"]!({
        ...realm,
        fetch: async () => {
          called = true;
          return new Response("{}");
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});

describe("quickbooks EventOnly webhooks", () => {
  it("omits unsupported Intuit entity-change webhook placeholders", () => {
    for (const key of ["webhook.customer_changed", "webhook.invoice_changed", "webhook.payment_changed"]) {
      expect(manifest.operations[key as keyof typeof manifest.operations]).toBeUndefined();
    }
    expect(Object.values(manifest.operations).filter((spec) => spec.kind === "webhook")).toEqual([]);
  });
});
