import { expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../src/declarative/compile";

const manifest = {
  key: "transport-test",
  network: { allowedHosts: ["api.example.test"] },
  http: {
    baseUrl: "https://api.example.test",
    auth: { field: "accessToken", in: "query", name: "access_token", value: "{{accessToken}}" },
  },
  operations: {
    read: {
      kind: "action", maxResponseBytes: 1024,
      inputSchema: { type: "object", properties: {} },
      request: { method: "GET", path: "/account" },
    },
  },
};

it("never exposes a transport error containing the authenticated request URL", async () => {
  const { actions } = compileDeclarativeConnector(manifest);
  await expect(actions.read!({
    accessToken: "private-stored-token",
    fetch: async (url: unknown) => { throw new Error(`Failed to fetch ${url}`); },
  })).rejects.toEqual({
    ok: false,
    code: "CONNECTOR_UNAVAILABLE",
    message: "Connector request failed.",
  });
});

it("preserves the safe outbound boundary failure when a redirect is rejected", async () => {
  const { actions } = compileDeclarativeConnector(manifest);
  await expect(actions.read!({
    accessToken: "private-stored-token",
    fetch: async () => new Response(null, { status: 307, headers: { Location: "https://elsewhere.test" } }),
  })).rejects.toEqual({
    ok: false,
    code: "OUTBOUND_REDIRECT_BLOCKED",
    message: "Outbound redirects are blocked by the connector HTTP boundary.",
  });
});

it("retains useful provider diagnostics for an ordinary upstream rejection", async () => {
  const { actions } = compileDeclarativeConnector(manifest);
  await expect(actions.read!({
    accessToken: "private-stored-token",
    fetch: async () => Response.json({ message: "Missing account.read scope" }, { status: 403 }),
  })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Missing account.read scope" });
});

it("recognizes numeric provider throttle codes without coercing other values", async () => {
  const { actions } = compileDeclarativeConnector({
    ...manifest,
    http: { ...manifest.http, errors: { rateLimitCodePaths: ["error.code"], rateLimitCodes: ["80002"], messagePaths: ["error.message"] } },
  });
  for (const code of [80002, "80002", 400, null, { code: 80002 }, [80002]]) {
    const throttle = code === 80002 || code === "80002";
    await expect(actions.read!({
      accessToken: "private-stored-token",
      fetch: async () => Response.json({ error: { code, message: "Provider rejected operation" } }, { status: 400 }),
    })).rejects.toMatchObject({ code: throttle ? "CONNECTOR_RATE_LIMITED" : "CONNECTOR_UPSTREAM_ERROR" });
  }
});

it("redacts reflected declared credentials in failed HTTP and body-error responses", async () => {
  const configured = {
    ...manifest,
    auth: { setup: {
      fields: [{ key: "password", secret: true }, { key: "label", secret: false }],
      routes: [{ fields: [{ key: "routeSecret", secret: true }] }],
      derive: [{ field: "basicAuth", kind: "basic", from: ["label", "password"] }],
    } },
    http: { ...manifest.http, errors: { bodyErrorPaths: ["error"], messagePaths: ["error.message"] } },
  };
  const { actions } = compileDeclarativeConnector(configured);
  const values = { accessToken: "token /+?", password: "password&=", routeSecret: "route#secret", basicAuth: "encoded/+==" };
  const variants = Object.values(values).flatMap(value => [value, encodeURIComponent(value), new URLSearchParams({ v: value }).toString().slice(2)]);
  for (const status of [400, 200]) {
    await expect(actions.read!({
      ...values, label: "Useful account name",
      fetch: async () => Response.json({ error: { message: `Useful account name: ${variants.join(" | ")}` } }, { status }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `Useful account name: ${variants.map(() => "[REDACTED]").join(" | ")}`,
    });
  }
});

it("handles invalid Unicode secrets and never coerces non-string credential values", async () => {
  const { actions } = compileDeclarativeConnector({
    ...manifest,
    auth: { setup: { fields: [{ key: "broken", secret: true }, { key: "object", secret: true }] } },
  });
  await expect(actions.read!({
    accessToken: "private-stored-token", broken: "bad\ud800secret",
    object: { toString() { throw new Error("must not coerce"); } },
    fetch: async () => Response.json({ message: "Rejected bad\ud800secret at bad%EF%BF%BDsecret" }, { status: 400 }),
  })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Rejected [REDACTED] at [REDACTED]" });
});
