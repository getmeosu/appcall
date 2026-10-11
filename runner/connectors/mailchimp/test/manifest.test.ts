import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("mailchimp manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("mailchimp");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
  });

  it("allows mailchimp wildcard host", () => {
    expect(manifest.network.allowedHosts).toContain("*.api.mailchimp.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("contacts.list");
    expect(ops).toContain("audiences.list");
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("contacts.create");
    expect(ops).toContain("healthcheck");
    // new action operations
    expect(ops).toContain("lists.members.get");
    expect(ops).toContain("lists.members.update");
    expect(ops).toContain("lists.members.upsert");
    expect(ops).toContain("lists.members.delete");
    expect(ops).toContain("lists.members.tags.add");
    expect(ops).toContain("lists.create");
    expect(ops).toContain("lists.get");
    expect(ops).toContain("campaigns.create");
    expect(ops).toContain("campaigns.get");
    expect(ops).toContain("campaigns.send");
    expect(ops).toContain("campaigns.unschedule");
    expect(ops).toContain("campaigns.schedule");
    expect(ops).toContain("campaigns.delete");
    expect(ops).toContain("campaigns.replicate");
    expect(ops).toContain("lists.update");
    expect(ops).toContain("lists.delete");
    expect(ops).toContain("members.notes.create");
    expect(ops).toContain("templates.list");
    expect(ops).toContain("templates.get");
    expect(ops).toContain("reports.summary");
    expect(ops).toContain("reports.opens");
    expect(ops).toContain("reports.clicks");
    expect(ops).toContain("reports.unsubscribed");
    expect(ops).toContain("automations.list");
    expect(ops).toContain("automations.get");
    expect(ops).toContain("webhook.subscribe");
    expect(ops).toContain("webhook.unsubscribe");
    expect(ops).toContain("webhook.campaign_sent");
    expect(ops).toContain("webhook.cleaned");
    expect(ops).toContain("webhook.profile_update");
    expect(ops).toContain("lists.members.archive");
    expect(ops).toContain("lists.members.tags.update");
  });

  it("depth actions have title, description, and object inputSchema", () => {
    const depthOps = [
      "campaigns.unschedule", "campaigns.schedule", "campaigns.delete", "campaigns.replicate",
      "lists.update", "lists.delete", "members.notes.create",
      "templates.list", "templates.get",
      "reports.summary", "reports.opens", "reports.clicks", "reports.unsubscribed",
      "automations.list", "automations.get",
    ];
    for (const op of depthOps) {
      const operation = (manifest.operations as any)[op];
      expect(operation.kind).toBe("action");
      expect(operation.title).toBeTruthy();
      expect(operation.description).toBeTruthy();
      expect(operation.inputSchema.type).toBe("object");
    }
  });

  it("webhooks are EventOnly manifest operations without tool schema", () => {
    for (const op of ["webhook.subscribe", "webhook.unsubscribe", "webhook.campaign_sent", "webhook.cleaned", "webhook.profile_update"]) {
      const operation = (manifest.operations as any)[op];
      expect(operation.kind).toBe("webhook");
      expect(operation.title).toBeUndefined();
      expect(operation.inputSchema).toBeUndefined();
    }
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["contact", "audience", "campaign", "template", "report", "automation", "note"]);
  });
});
