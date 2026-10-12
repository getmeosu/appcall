// SEC-PATH-2d: the ops the SEC-PATH-2c-3 sweep could not get a working call for
// (no-network ops and the excluded slack/bigmailer/bot-star aside) now reach the
// provider through the shared harness' reachOperation, and the path fields they
// expose are guarded: '.', '..' and blank values never produce a request, and
// other dot/separator forms never become a dot segment or an extra segment.
// Also covers the two fixes the sweep found (chaserhq invoiceId, and job-board
// syncs called without their board/site/company).
import { describe, expect, test } from "bun:test";
import { BLANK, DOT_ONLY, PERCENT_DOTS, SEPARATORS, outcomeOf, reachOperation } from "./path_segment_harness";

const PREVIOUSLY_UNREACHED: Record<string, string[]> = {
  "alt-text-ai": ["images.bulk_create", "images.create"],
  "ashby": ["applications.get", "applications.hire", "applications.move", "applications.reject", "candidates.get", "candidates.search", "hiring_team.add_member", "hiring_team.remove_member", "interview_stages.list", "interviews.schedule", "jobs.get", "jobs.list", "offers.create", "offers.get", "referrals.create"],
  "bolna": ["batches.create", "knowledgebases.create"],
  "bug-herd": ["columns.update", "projects.create"],
  "chaserhq": ["contact_persons.create", "contact_persons.upsertBulk", "credit_notes.create", "credit_notes.upsertBulk", "customers.create", "customers.upsertBulk", "invoices.create", "invoices.uploadPdf", "invoices.upsertBulk", "overpayments.create", "overpayments.upsertBulk"],
  "docusign": ["accounts.custom_fields.create", "accounts.custom_fields.update", "accounts.settings.update", "accounts.shared_access.update", "brands.create", "brands.delete_many", "cloud_storage.create", "cloud_storage.delete_many", "contacts.create", "contacts.delete_many", "contacts.update", "envelopes.attachments.create", "envelopes.attachments.delete", "envelopes.create", "envelopes.create_from_template", "envelopes.custom_fields.create", "envelopes.custom_fields.delete", "envelopes.custom_fields.update", "envelopes.document_fields.create", "envelopes.document_fields.delete", "envelopes.document_fields.update", "envelopes.document_visibility.update", "envelopes.documents.templates.apply", "envelopes.email_settings.create", "envelopes.email_settings.update", "envelopes.recipients.document_visibility.update", "envelopes.recipients.initials_image.update", "envelopes.recipients.signature_image.update", "groups.brands.delete", "groups.brands.update", "groups.create", "groups.delete", "groups.update", "groups.users.add", "groups.users.delete", "signing_groups.create", "signing_groups.delete", "signing_groups.update_names", "signing_groups.users.add", "signing_groups.users.delete", "stamps.create", "stamps.update", "templates.custom_fields.delete", "templates.custom_fields.update", "templates.document_fields.create", "templates.document_fields.create_alias", "templates.document_fields.delete", "templates.document_fields.update", "templates.document_visibility.update", "templates.document_visibility.update_all", "templates.favorites.add", "templates.favorites.delete", "templates.groups.share", "templates.groups.unshare", "users.authorizations.create", "users.authorizations.create_many", "users.change", "users.close", "users.create", "users.custom_settings.delete", "users.custom_settings.update", "users.profile.image.update", "users.settings.update", "users.signatures.image.update", "users.signatures.update", "workspaces.files.create", "workspaces.items.delete"],
  "heyzine": ["flipbooks.access_list.update"],
  "lever": ["candidates.get", "feedback.get", "interviews.get", "interviews.list", "jobs.list", "notes.list", "offers.get", "offers.list", "opportunities.feedback.list", "opportunities.get", "opportunities.interviews.list", "postings.get", "users.get"],
  "reply-io": ["contacts.create", "sequences.steps.create"],
  "shortcut": ["files.upload"],
  "smartrecruiters": ["applications.create", "applications.properties.update", "applications.update_status", "candidates.create", "candidates.get", "interviews.list", "job_applications.get", "jobs.get", "jobs.list", "postings.list"],
  "statuscake": ["sslTests.update"],
  "stripe": ["files.create"],
  "telegram": ["bot.setMyCommands", "chats.sendAction", "messages.sendLocation", "messages.sendPoll"],
  "workos": ["organizations.create", "organizations.update"]
};

const PIN: Record<string, Record<string, string>> = {
  lever: { region: "co" },
  telegram: { botToken: "123456:AAbc_d-e" },
  docusign: { restHost: "na2.docusign.net", oauthHost: "account-d.docusign.com" },
};

async function manifestOf(connector: string): Promise<any> {
  return (await import(`../../${connector}/manifest.json`)).default;
}

async function credsFor(connector: string): Promise<Record<string, unknown>> {
  const m = await manifestOf(connector);
  const fields = [...(m.auth?.setup?.fields ?? []), ...((m.auth?.setup?.routes ?? []).flatMap((r: any) => r.fields ?? []))];
  const creds: Record<string, unknown> = {};
  let i = 0;
  for (const f of fields) {
    creds[f.key] = PIN[connector]?.[f.key]
      ?? (/url/i.test(f.key) ? `https://h${i++}.example.com` : /host|domain$/i.test(f.key) && f.key !== "companyDomain" ? `h${i++}.example.com` : `sk${i++}x${f.key.replace(/[^A-Za-z0-9]/g, "")}`);
  }
  const authField = m.http?.auth?.field;
  if (authField && !(authField in creds)) creds[authField] = `tok${authField}`;
  if (fields.length === 0 && !authField) for (const k of ["apiKey", "accessToken", "token"]) creds[k] = `tok${k}`;
  return creds;
}

const segments = (url: string) => new URL(url).pathname.split("/").length;
function rfcDot(pathname: string): boolean {
  return pathname.split("/").some((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
    return /^\.+$/.test(decoded);
  });
}

describe("SEC-PATH-2d previously unreached ops", () => {
  for (const [connector, ops] of Object.entries(PREVIOUSLY_UNREACHED)) {
    test(`${connector}: ${ops.length} ops reach the provider and guard their path fields`, async () => {
      const m = await manifestOf(connector);
      const creds = await credsFor(connector);
      for (const op of ops) {
        const kind = m.operations[op]?.kind === "sync" ? "sync" : "action";
        const reached = await reachOperation(connector, op, creds, kind);
        expect(reached.input, `${connector}.${op}: ${reached.failure}`).not.toBeNull();
        const input = reached.input!;
        for (const [field, value] of Object.entries(input)) {
          if (typeof value !== "string" || value.length < 4) continue;
          const index = reached.calls.findIndex((c) => new URL(c.url).pathname.includes(encodeURIComponent(value)));
          if (index < 0) continue;
          const base = segments(reached.calls[index]!.url);
          for (const bad of [".", "..", ...BLANK]) {
            const r = await outcomeOf(connector, op, { ...input, [field]: bad }, kind);
            expect(r.calls, `${connector}.${op} ${field}=${JSON.stringify(bad)}`).toEqual([]);
          }
          for (const bad of [" . ", " .. ", ...PERCENT_DOTS, ...SEPARATORS]) {
            const r = await outcomeOf(connector, op, { ...input, [field]: bad }, kind);
            for (const c of r.calls) expect(rfcDot(new URL(c.url).pathname), `${connector}.${op} ${field}=${bad} -> ${c.url}`).toBe(false);
            if (r.calls[index]) expect(segments(r.calls[index]!.url), `${connector}.${op} ${field}=${bad}`).toBe(base);
          }
        }
      }
    }, 120_000);
  }
});

describe("SEC-PATH-2d fixes", () => {
  test("chaserhq invoices.uploadPdf rejects unsafe invoiceId with 0 fetches", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");
    const base = { apiKey: "k", apiSecret: "s", fileBase64: pdf, fileName: "invoice.pdf" };
    const ok = await outcomeOf("chaserhq", "invoices.uploadPdf", { ...base, invoiceId: "INV-1" });
    expect(ok.calls.length).toBeGreaterThan(0);
    for (const bad of [...DOT_ONLY, ...BLANK, ...PERCENT_DOTS, ...SEPARATORS, "%20"]) {
      const r = await outcomeOf("chaserhq", "invoices.uploadPdf", { ...base, invoiceId: bad });
      expect(r.calls, JSON.stringify(bad)).toEqual([]);
      expect(r.code, JSON.stringify(bad)).toBe("INVALID_ACTION_INPUT");
    }
  });
  test("job-board syncs without a board/site/company fail as required, not a TypeError", async () => {
    for (const [connector, field] of [["lever", "site"], ["smartrecruiters", "company"], ["ashby", "boardName"]] as const) {
      for (const value of [undefined, 42, null]) {
        const r = await outcomeOf(connector, "jobs.list", value === undefined ? { apiKey: "k" } : { apiKey: "k", [field]: value }, "sync");
        expect(r.calls).toEqual([]);
        expect(r.ok).toBe(false);
        expect(String(r.message), `${connector} ${String(value)}`).toBe(`${field} is required`);
      }
    }
  });
});
