// Fixture actions written in the Activepieces style, importing the shims the
// resolver would substitute. They cover the shapes the extractor must handle:
// a direct httpClient call, one routed through the piece's own helper, a vendor
// SDK, a multi-request action, and an action with an untraceable boolean input.
import { createAction, Property } from "../../shims/pieces-framework";
import { httpClient, HttpMethod } from "../../shims/pieces-common";

async function pieceRequest(options: { auth: string; method: string; path: string; body?: unknown }) {
  return httpClient.sendRequest({
    method: options.method,
    url: `https://api.fixture.test/v2${options.path}`,
    headers: { Authorization: `Bearer ${options.auth}`, "Content-Type": "application/json" },
    body: options.body,
  });
}

export const createContact = createAction({
  name: "create_contact",
  displayName: "Create Contact",
  description: "Create a contact.",
  aiMetadata: { description: "Creates a contact from an email and optional name.", idempotent: false },
  props: {
    email: Property.ShortText({ displayName: "Email", required: true }),
    firstName: Property.ShortText({ displayName: "First Name", required: false }),
    tags: Property.Array({ displayName: "Tags", required: false }),
  },
  async run(context: any) {
    const { email, firstName, tags } = context.propsValue;
    return httpClient.sendRequest({
      method: HttpMethod.POST,
      url: "https://api.fixture.test/v2/contacts",
      headers: { Authorization: `Bearer ${context.auth}` },
      body: { email, first_name: firstName, labels: tags },
    });
  },
});

export const getContact = createAction({
  name: "get_contact",
  displayName: "Get Contact",
  description: "Fetch one contact by ID.",
  props: {
    contactId: Property.ShortText({ displayName: "Contact ID", required: true }),
    expand: Property.ShortText({ displayName: "Expand", required: false }),
  },
  async run({ auth, propsValue }: any) {
    return httpClient.sendRequest({
      method: HttpMethod.GET,
      url: `https://api.fixture.test/v2/contacts/${encodeURIComponent(propsValue.contactId)}`,
      headers: { Authorization: `Bearer ${auth}` },
      queryParams: { expand: propsValue.expand },
    });
  },
});

export const updateDeal = createAction({
  name: "update_deal",
  displayName: "Update Deal",
  description: "Update a deal through the piece's own request helper.",
  props: {
    dealId: Property.ShortText({ displayName: "Deal ID", required: true }),
    amount: Property.Number({ displayName: "Amount", required: false }),
    notes: Property.LongText({ displayName: "Notes", required: false }),
  },
  async run(context: any) {
    const p = context.propsValue;
    const body: Record<string, unknown> = {};
    if (p.amount !== undefined) body["amount_cents"] = p.amount;
    if (p.notes) body["notes"] = p.notes;
    return pieceRequest({ auth: context.auth, method: HttpMethod.PATCH, path: `/deals/${p.dealId}`, body });
  },
});

export const archiveDeal = createAction({
  name: "archive_deal",
  displayName: "Archive Deal",
  description: "Archive a deal and log it.",
  props: { dealId: Property.ShortText({ displayName: "Deal ID", required: true }) },
  async run(context: any) {
    await pieceRequest({ auth: context.auth, method: HttpMethod.POST, path: `/deals/${context.propsValue.dealId}/archive` });
    return pieceRequest({ auth: context.auth, method: HttpMethod.POST, path: "/audit" });
  },
});

export const sdkAction = createAction({
  name: "create_ticket",
  displayName: "Create Ticket",
  description: "Create a ticket through a vendor SDK.",
  props: { subject: Property.ShortText({ displayName: "Subject", required: true }) },
  async run(context: any) {
    const client = { tickets: { create: async (input: unknown) => input } };
    return client.tickets.create({ subject: context.propsValue.subject });
  },
});

export const toggleAction = createAction({
  name: "set_subscription",
  displayName: "Set Subscription",
  description: "Subscribe or unsubscribe a contact.",
  props: {
    email: Property.ShortText({ displayName: "Email", required: true }),
    subscribed: Property.Checkbox({ displayName: "Subscribed", required: true }),
  },
  async run(context: any) {
    return httpClient.sendRequest({
      method: HttpMethod.POST,
      url: "https://api.fixture.test/v2/subscriptions",
      headers: { Authorization: `Bearer ${context.auth}` },
      body: { email: context.propsValue.email, subscribed: context.propsValue.subscribed },
    });
  },
});

export const brokenAction = createAction({
  name: "list_reports",
  displayName: "List Reports",
  description: "Reads the response before returning.",
  props: {},
  async run(context: any) {
    const response: any = await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: "https://api.fixture.test/v2/reports",
      headers: { Authorization: `Bearer ${context.auth}` },
    });
    return response.body.items.map((item: any) => item.id);
  },
});
