import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);

describe("quickbooks connector healthcheck", () => {
  test("echoes connector-owned healthy status without credentials", async () => {
    expect(await actions.healthcheck!({})).toEqual({
      connector: "quickbooks",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  test("reads CompanyInfo when credentials are present", async () => {
    const result = await actions.healthcheck!({
      accessToken: "token",
      realmId: "9341452710",
      fetch: async (url: unknown) => {
        expect(String(url)).toBe("https://quickbooks.api.intuit.com/v3/company/9341452710/companyinfo/9341452710");
        return new Response(JSON.stringify({ CompanyInfo: { Id: "9341452710", CompanyName: "Example Co" } }), { status: 200 });
      },
    });
    expect(result).toMatchObject({
      connector: "quickbooks",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      company: { Id: "9341452710", CompanyName: "Example Co" },
    });
  });
});
