import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("brevo connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("brevo");
    expect(manifest.name).toBe("Brevo");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("offers api_key and smtp connection routes", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const routes = manifest.auth.setup.routes;
    const apiRoute = routes.find((r: { id: string }) => r.id === "api_key");
    expect(apiRoute).toBeDefined();
    const apiKeyField = apiRoute.fields.find((f: { key: string }) => f.key === "apiKey");
    expect(apiKeyField.required).toBe(true);
    expect(apiKeyField.secret).toBe(true);
    const smtpRoute = routes.find((r: { id: string }) => r.id === "smtp");
    expect(smtpRoute).toBeDefined();
    const smtpPassword = smtpRoute.fields.find((f: { key: string }) => f.key === "smtpPassword");
    expect(smtpPassword.secret).toBe(true);
  });

  test("network allows the api and smtp relay hosts", () => {
    expect(manifest.network.allowedHosts).toContain("api.brevo.com");
    expect(manifest.network.allowedHosts).toContain("smtp-relay.brevo.com");
  });

  test("operations include sync, action, and healthcheck kinds", () => {
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["lists.list"].kind).toBe("sync");
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["contacts.create"].kind).toBe("action");
    expect(manifest.operations["contacts.get"].kind).toBe("action");
    expect(manifest.operations["contacts.update"].kind).toBe("action");
    expect(manifest.operations["contacts.delete"].kind).toBe("action");
    expect(manifest.operations["smtp.email.send"].kind).toBe("action");
    expect(manifest.operations["lists.create"].kind).toBe("action");
    expect(manifest.operations["lists.get"].kind).toBe("action");
    expect(manifest.operations["contacts.addToList"].kind).toBe("action");
    expect(manifest.operations["contacts.removeFromList"].kind).toBe("action");
    expect(manifest.operations["emailCampaigns.create"].kind).toBe("action");
    expect(manifest.operations["emailCampaigns.send"].kind).toBe("action");
    expect(manifest.operations["emailCampaigns.get"].kind).toBe("action");
    expect(manifest.operations["emailCampaigns.update"].kind).toBe("action");
    expect(manifest.operations["account.get"].kind).toBe("action");
    expect(manifest.operations["companies.create"].kind).toBe("action");
    expect(manifest.operations["smtp.templates.createOrUpdate"].kind).toBe("action");
    expect(manifest.operations["smsCampaigns.create"].kind).toBe("action");
    expect(manifest.operations["contacts.import"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(Object.keys(manifest.operations)).toHaveLength(38);
  });

  test("new action operations have required fields (title, description, object inputSchema, outputSchema)", () => {
    const newOps = [
      "contacts.get", "contacts.update", "contacts.delete",
      "smtp.email.send",
      "lists.create", "lists.get",
      "contacts.addToList", "contacts.removeFromList",
      "emailCampaigns.create", "emailCampaigns.send", "emailCampaigns.get", "emailCampaigns.update",
      "account.get", "companies.create", "companies.get", "companies.delete", "companies.list",
      "smtp.templates.createOrUpdate", "smtp.templates.delete", "smtp.templates.list", "smtp.templates.get",
      "smsCampaigns.create", "smsCampaigns.delete", "smsCampaigns.get", "smsCampaigns.list",
      "contacts.campaignStats.get", "contacts.import", "contacts.attributes.list",
      "crm.notes.list", "crm.objects.records.list",
      "senders.list", "senders.domains.list", "smtp.events.list",
    ];
    for (const opKey of newOps) {
      const op = manifest.operations[opKey as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(op.title, `${opKey} missing title`).toBeTruthy();
      expect(op.description, `${opKey} missing description`).toBeTruthy();
      const schema = op.inputSchema as Record<string, unknown>;
      expect(schema.type, `${opKey} inputSchema.type`).toBe("object");
      expect(op.outputSchema, `${opKey} missing outputSchema`).toBeDefined();
      expect(op.timeoutMs, `${opKey} missing timeoutMs`).toBeGreaterThan(0);
      expect(op.maxInputBytes, `${opKey} missing maxInputBytes`).toBeGreaterThan(0);
      expect(op.maxResponseBytes, `${opKey} missing maxResponseBytes`).toBeGreaterThan(0);
    }
  });

  test("operations declare timeout and size bounds", () => {
    const contacts = manifest.operations["contacts.list"];
    expect(contacts.timeoutMs).toBe(30000);
    expect(contacts.maxResponseBytes).toBe(5242880);

    const healthcheck = manifest.operations["healthcheck"];
    expect(healthcheck.timeoutMs).toBe(5000);
    expect(healthcheck.maxResponseBytes).toBe(65536);
  });

  test("models include contact, list, campaign, and Composio CRM resources", () => {
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("list");
    expect(manifest.models).toContain("campaign");
    expect(manifest.models).toContain("company");
    expect(manifest.models).toContain("template");
    expect(manifest.models).toContain("smsCampaign");
    expect(manifest.models).toContain("sender");
    expect(manifest.models).toContain("note");
    expect(manifest.models).toHaveLength(8);
  });

  test("new Composio operations have a request-less handwritten handler contract (title, description, object inputSchema)", () => {
    const readOps = [
      "account.get", "companies.get", "companies.list",
      "smtp.templates.list", "smtp.templates.get",
      "smsCampaigns.get", "smsCampaigns.list",
      "contacts.campaignStats.get", "contacts.attributes.list",
      "crm.notes.list", "crm.objects.records.list",
      "senders.list", "senders.domains.list", "smtp.events.list",
    ];
    for (const opKey of readOps) {
      const op = manifest.operations[opKey as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(op.sideEffect, `${opKey} sideEffect`).toBe("read");
    }
    const writeOps = [
      "companies.create", "companies.delete",
      "smtp.templates.createOrUpdate", "smtp.templates.delete",
      "smsCampaigns.create", "smsCampaigns.delete",
      "contacts.import", "emailCampaigns.update",
    ];
    for (const opKey of writeOps) {
      const op = manifest.operations[opKey as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(op.sideEffect, `${opKey} sideEffect`).toBe("write");
    }
  });
});
