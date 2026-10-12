import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import {
  sendMedia,
  sendMediaById,
  updateFlowJson,
} from "../src/actions";
import sendMediaFixture from "../fixtures/send_message.json";
import updateFlowJsonFixture from "../fixtures/flow_update_json.json";

export const COMPOSIO_TOOL_OPERATIONS: Record<string, string> = {
  WHATSAPP_BLOCK_USERS: "users.block",
  WHATSAPP_CONFIGURE_CONVERSATIONAL_AUTOMATION: "conversationalAutomation.configure",
  WHATSAPP_CREATE_FLOW: "flows.create",
  WHATSAPP_CREATE_MAX_PRICE_AGREEMENTS: "pricing.maxPriceAgreements.create",
  WHATSAPP_CREATE_MESSAGE_TEMPLATE: "templates.create",
  WHATSAPP_CREATE_QR_CODE: "qrCodes.create",
  WHATSAPP_CREATE_UPLOAD_SESSION: "uploads.createSession",
  WHATSAPP_DELETE_MEDIA: "media.delete",
  WHATSAPP_DELETE_MESSAGE_TEMPLATE: "templates.delete",
  WHATSAPP_DELETE_QR_CODE: "qrCodes.delete",
  WHATSAPP_DEREGISTER_PHONE: "phoneNumbers.deregister",
  WHATSAPP_GET_ACTIVITIES: "activities.list",
  WHATSAPP_GET_BUSINESS_ACCOUNT_DETAILS: "businessAccounts.get",
  WHATSAPP_GET_BUSINESS_COMPLIANCE_INFO: "compliance.get",
  WHATSAPP_GET_BUSINESS_ENCRYPTION: "encryption.get",
  WHATSAPP_GET_BUSINESS_PROFILE: "businessProfile.get",
  WHATSAPP_GET_CLIENT_BUSINESS_ACCOUNTS: "businessAccounts.listClient",
  WHATSAPP_GET_COMMERCE_SETTINGS: "commerceSettings.get",
  WHATSAPP_GET_FLOW_ASSETS: "flows.getAssets",
  WHATSAPP_GET_JOIN_REQUESTS: "groups.getJoinRequests",
  WHATSAPP_GET_MEDIA_INFO: "media.get",
  WHATSAPP_GET_MESSAGE_HISTORY: "messages.history",
  WHATSAPP_GET_MESSAGE_TEMPLATES: "templates.list",
  WHATSAPP_GET_OWNED_BUSINESS_ACCOUNTS: "businessAccounts.listOwned",
  WHATSAPP_GET_PHONE_NUMBER: "phoneNumbers.get",
  WHATSAPP_GET_PHONE_NUMBERS: "phoneNumbers.list",
  WHATSAPP_GET_SCHEDULES: "schedules.list",
  WHATSAPP_GET_SETTINGS: "settings.get",
  WHATSAPP_GET_SUBSCRIBED_APPS: "subscribedApps.list",
  WHATSAPP_GET_TEMPLATE_LIBRARY: "templates.library",
  WHATSAPP_GET_TEMPLATE_STATUS: "templates.get",
  WHATSAPP_LIST_FLOWS: "flows.list",
  WHATSAPP_LIST_GROUPS: "groups.list",
  WHATSAPP_LIST_QR_CODES: "qrCodes.list",
  WHATSAPP_LIST_SOLUTIONS: "solutions.list",
  WHATSAPP_PUBLISH_FLOW: "flows.publish",
  WHATSAPP_REGISTER_PHONE: "phoneNumbers.register",
  WHATSAPP_REMOVE_ASSIGNED_USER: "assignedUsers.remove",
  WHATSAPP_SEND_CONTACTS: "messages.sendContacts",
  WHATSAPP_SEND_INTERACTIVE_BUTTONS: "messages.sendInteractive",
  WHATSAPP_SEND_INTERACTIVE_LIST: "messages.sendInteractive",
  WHATSAPP_SEND_LOCATION: "messages.sendLocation",
  WHATSAPP_SEND_MEDIA: "messages.sendMedia",
  WHATSAPP_SEND_MEDIA_BY_ID: "messages.sendMediaById",
  WHATSAPP_SEND_MESSAGE: "messages.send",
  WHATSAPP_SEND_TEMPLATE_MESSAGE: "messages.sendTemplate",
  WHATSAPP_SET_TWO_STEP_VERIFICATION: "phoneNumbers.setPin",
  WHATSAPP_SUBSCRIBE_APP: "subscribedApps.subscribe",
  WHATSAPP_UNSUBSCRIBE_APP: "subscribedApps.unsubscribe",
  WHATSAPP_UPDATE_BUSINESS_ACCOUNT: "flows.update",
  WHATSAPP_UPDATE_BUSINESS_PROFILE: "businessProfile.update",
  WHATSAPP_UPDATE_COMMERCE_SETTINGS: "commerceSettings.update",
  WHATSAPP_UPDATE_FLOW_JSON: "flows.updateJson",
  WHATSAPP_UPDATE_SETTINGS: "settings.update",
  WHATSAPP_UPLOAD_MEDIA: "media.upload",
  WHATSAPP_UPSERT_MESSAGE_TEMPLATE: "templates.upsert",
  WHATSAPP_VERIFY_CODE: "phoneNumbers.verifyCode",
  WHATSAPP_WHO_AM_I: "me.get",
};

const HANDWRITTEN_NEW_OPS = new Set([
  "messages.sendMedia",
  "messages.sendMediaById",
  "flows.updateJson",
]);

const BASELINE_OPS = [
  "messages.send",
  "credentials.validate",
  "messages.sendTemplate",
  "messages.sendImage",
  "messages.sendDocument",
  "messages.sendLocation",
  "messages.sendContacts",
  "messages.sendReaction",
  "messages.markRead",
  "messages.sendInteractive",
  "healthcheck",
  "messages.get",
  "templates.list",
  "media.get",
  "media.upload",
  "media.delete",
  "messages.sendAudio",
  "messages.sendVideo",
  "businessProfile.get",
  "businessProfile.update",
  "phoneNumbers.get",
  "webhook.message_received",
];

type ExchangeCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  method: string;
  pathname: string;
  query?: Record<string, string>;
  body: unknown;
  response: unknown;
};

function loadCases(): ExchangeCase[] {
  const dir = join(import.meta.dir, "../fixtures/cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as ExchangeCase);
}

describe("whatsapp composio mapping", () => {
  const operations = manifest.operations as Record<string, Record<string, unknown>>;

  test("maps all 58 Composio WhatsApp tools onto real operations", () => {
    expect(Object.keys(COMPOSIO_TOOL_OPERATIONS)).toHaveLength(58);
    for (const [tool, operation] of Object.entries(COMPOSIO_TOOL_OPERATIONS)) {
      const spec = operations[operation];
      expect(spec, `${tool} -> ${operation}`).toBeDefined();
      expect(spec.kind).toBe("action");
      expect(typeof spec.title).toBe("string");
      expect(String(spec.title).length).toBeGreaterThan(0);
      expect(typeof spec.description).toBe("string");
      expect(String(spec.description).length).toBeGreaterThan(0);
      const inputSchema = spec.inputSchema as { type?: string };
      expect(inputSchema?.type).toBe("object");
    }
  });

  test("keeps origin/main baseline operations and bumps the minor version", () => {
    expect(manifest.version).toBe("0.3.1");
    for (const key of BASELINE_OPS) {
      expect(operations[key], key).toBeDefined();
    }
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(BASELINE_OPS.length + 36);
  });

  test("keeps webhook side effects as read", () => {
    for (const [name, spec] of Object.entries(operations)) {
      if (spec.kind === "webhook") {
        expect(spec.sideEffect, name).toBe("read");
      }
    }
  });

  test("new Composio actions are real HTTP tools", () => {
    const mappedOps = [...new Set(Object.values(COMPOSIO_TOOL_OPERATIONS))];
    for (const key of mappedOps) {
      if (BASELINE_OPS.includes(key) || HANDWRITTEN_NEW_OPS.has(key)) continue;
      const spec = operations[key];
      const request = spec.request as { method?: string; path?: string } | undefined;
      expect(request?.method, key).toMatch(/^(GET|POST|PATCH|PUT|DELETE)$/);
      expect(String(request?.path ?? "").length, key).toBeGreaterThan(0);
    }
  });

  test("declarative http uses the access token secret field", () => {
    expect(manifest.http.auth.field).toBe("accessToken");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.http.baseUrl).toBe("https://graph.facebook.com");
    expect(manifest.network.allowedHosts).toEqual(["graph.facebook.com"]);
  });
});

describe("whatsapp declarative composio fixtures", () => {
  const compiled = compileDeclarativeConnector(manifest as never);
  const cases = loadCases();

  test("covers every compiled request-block action", () => {
    const covered = new Set(cases.map((item) => item.operation));
    expect([...covered].sort()).toEqual(Object.keys(compiled.actions).sort());
  });

  test("replays pinned Graph exchanges without network", async () => {
    expect(cases.length).toBeGreaterThanOrEqual(36);
    for (const item of cases) {
      const handler = compiled.actions[item.operation];
      expect(handler, item.operation).toBeDefined();

      const validated = handler(item.input) as Record<string, unknown>;
      expect(validated.connector).toBe("whatsapp");
      expect(validated.action).toBe(item.operation);
      expect(validated.source).toBe("connector");

      let calls = 0;
      const result = await handler({
        ...item.input,
        accessToken: "meta-test-token",
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          calls += 1;
          const parsed = new URL(String(input));
          const method = String(init?.method ?? "GET").toUpperCase();
          expect(method).toBe(item.method.toUpperCase());
          expect(parsed.origin).toBe("https://graph.facebook.com");
          expect(parsed.pathname).toBe(item.pathname);
          for (const [key, value] of Object.entries(item.query ?? {})) {
            expect(parsed.searchParams.get(key)).toBe(value);
          }
          const auth = new Headers(init?.headers).get("authorization");
          expect(auth).toBe("Bearer meta-test-token");
          if (item.body === null) {
            expect(init?.body == null || init?.body === "").toBe(true);
          } else {
            expect(JSON.parse(String(init?.body))).toEqual(item.body);
          }
          return Response.json(item.response);
        },
      }) as Record<string, unknown>;
      expect(calls).toBe(1);
      expect(result.source).toBe("provider");
      expect(result.action).toBe(item.operation);
      expect(result.data).toEqual(item.response);
    }
  });
});

describe("whatsapp handwritten composio tools", () => {
  test("messages.sendMedia posts a link payload for the selected type", async () => {
    const requests: Request[] = [];
    const result = await sendMedia({
      accessToken: "meta-test-token",
      phoneNumberId: "123456789",
      to: "15551234567",
      mediaType: "image",
      link: "https://example.com/photo.jpg",
      caption: "hello",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json(sendMediaFixture);
      },
    }) as Record<string, unknown>;
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0]!.method).toBe("POST");
    expect(await requests[0]!.json()).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "image",
      image: { link: "https://example.com/photo.jpg", caption: "hello" },
    });
    expect(result.providerMessageId).toBe(sendMediaFixture.messages[0]!.id);
  });

  test("messages.sendMediaById posts a media id payload", async () => {
    const requests: Request[] = [];
    const result = await sendMediaById({
      accessToken: "meta-test-token",
      phoneNumberId: "123456789",
      to: "15551234567",
      mediaType: "document",
      mediaId: "MEDIA123",
      filename: "invoice.pdf",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json(sendMediaFixture);
      },
    }) as Record<string, unknown>;
    expect(await requests[0]!.json()).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "document",
      document: { id: "MEDIA123", filename: "invoice.pdf" },
    });
    expect(result.providerMessageId).toBe(sendMediaFixture.messages[0]!.id);
  });

  test("flows.updateJson uploads multipart flow JSON", async () => {
    const requests: Request[] = [];
    const result = await updateFlowJson({
      accessToken: "meta-test-token",
      flowId: "FLOW123",
      flowJson: JSON.stringify({ version: "7.0", screens: [] }),
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json(updateFlowJsonFixture);
      },
    }) as Record<string, unknown>;
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v25.0/FLOW123/assets");
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.headers.get("content-type") ?? "").toContain("multipart/form-data");
    expect(result.success).toBe(true);
  });

  test("new handwritten tools validate without credentials", () => {
    expect(sendMedia({
      phoneNumberId: "123456789",
      to: "15551234567",
      mediaType: "sticker",
      link: "https://example.com/sticker.webp",
    })).toMatchObject({
      connector: "whatsapp",
      action: "messages.sendMedia",
      source: "connector",
    });
    expect(sendMediaById({
      phoneNumberId: "123456789",
      to: "15551234567",
      mediaType: "audio",
      mediaId: "MEDIA123",
    })).toMatchObject({
      connector: "whatsapp",
      action: "messages.sendMediaById",
      source: "connector",
    });
    expect(updateFlowJson({
      flowId: "FLOW123",
      flowJson: "{}",
    })).toMatchObject({
      connector: "whatsapp",
      action: "flows.updateJson",
      source: "connector",
    });
  });
});
