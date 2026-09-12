import { describe, expect, test } from "bun:test";
import { healthcheck as apifyHealthcheck } from "../../connectors/apify/src/healthcheck";
import { healthcheck as apolloHealthcheck } from "../../connectors/apollo/src/healthcheck";
import { healthcheck as brevoHealthcheck } from "../../connectors/brevo/src/healthcheck";
import { healthcheck as caldavHealthcheck } from "../../connectors/caldav/src/healthcheck";
import { healthcheck as googleMeetHealthcheck } from "../../connectors/googlemeet/src/healthcheck";
import { healthcheck as klaviyoHealthcheck } from "../../connectors/klaviyo/src/healthcheck";
import { healthcheck as lushaHealthcheck } from "../../connectors/lusha/src/healthcheck";
import { healthcheck as notionHealthcheck } from "../../connectors/notion/src/healthcheck";
import { healthcheck as resendHealthcheck } from "../../connectors/resend/src/healthcheck";
import { healthcheck as saleshandyHealthcheck } from "../../connectors/saleshandy/src/healthcheck";
import { healthcheck as sendgridHealthcheck } from "../../connectors/sendgrid/src/healthcheck";
import { healthcheck as slackHealthcheck } from "../../connectors/slack/src/healthcheck";
import { healthcheck as telegramHealthcheck } from "../../connectors/telegram/src/healthcheck";
import { healthcheck as unipileHealthcheck } from "../../connectors/unipile/src/healthcheck";
import { healthcheck as whatsappHealthcheck } from "../../connectors/whatsapp/src/healthcheck";
import { healthcheck as githubHealthcheck } from "../../connectors/github/src/healthcheck";

type Healthcheck = (input?: unknown) => unknown;

const nativeHttpHealthchecks: Array<{ name: string; healthcheck: Healthcheck; input: Record<string, unknown> }> = [
  { name: "apify", healthcheck: apifyHealthcheck, input: { apiKey: "test" } },
  { name: "apollo", healthcheck: apolloHealthcheck, input: { apiKey: "test" } },
  { name: "brevo", healthcheck: brevoHealthcheck, input: { apiKey: "test" } },
  { name: "caldav", healthcheck: caldavHealthcheck, input: { username: "user@example.com", password: "test" } },
  { name: "googlemeet", healthcheck: googleMeetHealthcheck, input: { accessToken: "test" } },
  { name: "klaviyo", healthcheck: klaviyoHealthcheck, input: { apiKey: "test" } },
  { name: "lusha", healthcheck: lushaHealthcheck, input: { apiKey: "test" } },
  { name: "notion", healthcheck: notionHealthcheck, input: { notionToken: "test" } },
  { name: "resend", healthcheck: resendHealthcheck, input: { apiKey: "test" } },
  { name: "saleshandy", healthcheck: saleshandyHealthcheck, input: { apiKey: "test" } },
  { name: "sendgrid", healthcheck: sendgridHealthcheck, input: { apiKey: "test" } },
  { name: "slack", healthcheck: slackHealthcheck, input: { token: "test" } },
  { name: "telegram", healthcheck: telegramHealthcheck, input: { botToken: "test" } },
  { name: "unipile", healthcheck: unipileHealthcheck, input: { apiKey: "test", dsn: "https://api8.unipile.com:13851" } },
  { name: "whatsapp", healthcheck: whatsappHealthcheck, input: { accessToken: "test", phoneNumberId: "123" } },
  { name: "github", healthcheck: githubHealthcheck, input: { accessToken: "test" } },
];

describe("native HTTP healthcheck boundaries", () => {
  test("blocks cross-host redirects before a provider can receive credentials", async () => {
    for (const entry of nativeHttpHealthchecks) {
      let forwarded = false;
      let requestInit: RequestInit | undefined;
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        requestInit = init;
        if (init?.redirect === "manual") {
          return new Response(null, {
            status: 302,
            headers: { location: "https://attacker.example/collect" },
          });
        }
        forwarded = true;
        return Response.json({ ok: true });
      };

      const result = await Promise.resolve()
        .then(() => entry.healthcheck({ ...entry.input, fetch }))
        .then(() => "resolved", () => "rejected");

      expect(result, entry.name).toBe("rejected");
      expect(requestInit?.redirect, entry.name).toBe("manual");
      expect(forwarded, entry.name).toBe(false);
    }
  });

  test("enforces the healthcheck response-size limit", async () => {
    const oversizedBody = "x".repeat(65_537);
    for (const entry of nativeHttpHealthchecks) {
      const fetch: typeof globalThis.fetch = async () => new Response(oversizedBody, { status: 200 });
      const result = await Promise.resolve()
        .then(() => entry.healthcheck({ ...entry.input, fetch }))
        .then(() => "resolved", () => "rejected");

      expect(result, entry.name).toBe("rejected");
    }
  });
});
