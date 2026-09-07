import { describe, expect, it } from "bun:test";
import { parseArgs, optionsFromArgs } from "../index";

describe("parseArgs", () => {
  it("reads flag/value pairs and bare flags", () => {
    expect(parseArgs(["--key", "acme", "--name", "Acme", "--dry-run"])).toEqual({
      key: "acme",
      name: "Acme",
      "dry-run": true,
    });
  });
});

describe("optionsFromArgs", () => {
  it("splits comma separated lists and defaults the auth placement", () => {
    const options = optionsFromArgs({
      key: "acme",
      name: "Acme",
      tags: "Contacts, Deals",
      categories: "crm",
      models: "contact,deal",
    });
    expect(options.includeTags).toEqual(["Contacts", "Deals"]);
    expect(options.categories).toEqual(["crm"]);
    expect(options.models).toEqual(["contact", "deal"]);
    expect(options.auth).toMatchObject({ type: "api_key", field: "apiKey", in: "header", name: "Authorization" });
  });

  it("requires a connector key", () => {
    expect(() => optionsFromArgs({ name: "Acme" })).toThrow("--key is required");
  });

  it("keeps a query-placed credential", () => {
    const options = optionsFromArgs({ key: "acme", "auth-in": "query", "auth-header": "access_token", "auth-field": "token" });
    expect(options.auth).toMatchObject({ in: "query", name: "access_token", field: "token" });
  });
});
