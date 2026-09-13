export type ApprovedContract = {
  appcallId?: string;
  templateKey?: string;
  authType: "api_key" | "oauth2";
  setupMode: "api_key" | "oauth2";
  authField: string;
  baseUrl: string;
  allowedHosts: readonly string[];
  httpAuth?: { field: string; in?: "header" | "body"; name?: string; value?: string; basic?: { username: string; password: string } };
  oauth?: { authorizeUrl: string; tokenUrl: string };
  operationMethods: Readonly<Record<string, "GET" | "POST">>;
};
const get = (
  baseUrl: string,
  authField = "apiKey",
  name = "Authorization",
  value = `Bearer {{${authField}}}`,
): ApprovedContract => ({
  authType: "api_key",
  setupMode: "api_key",
  authField,
  baseUrl,
  allowedHosts: [new URL(baseUrl).hostname],
  httpAuth: { field: authField, in: "header", name, value },
  operationMethods: {},
});
export const approvedContracts: Readonly<Record<string, ApprovedContract>> = {
  coda: get("https://coda.io/apis/v1"),
  helpscout: {
    ...get("https://api.helpscout.net/v2", "accessToken"),
    authType: "oauth2",
    setupMode: "oauth2",
    allowedHosts: ["api.helpscout.net", "secure.helpscout.net"],
    oauth: {
      authorizeUrl:
        "https://secure.helpscout.net/authentication/authorizeClientApplication",
      tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
    },
  },
  kit: get("https://api.kit.com/v4", "apiKey", "X-Kit-Api-Key", "{{apiKey}}"),
  beehiiv: get("https://api.beehiiv.com/v2"),
  clockify: get(
    "https://api.clockify.me/api/v1",
    "apiKey",
    "X-Api-Key",
    "{{apiKey}}",
  ),
  wrike: get("https://www.wrike.com/api/v4"),
  smartsheet: get("https://api.smartsheet.com/2.0"),
  buttondown: get(
    "https://api.buttondown.com/v1",
    "apiKey",
    "Authorization",
    "Token {{apiKey}}",
  ),
  loops: get("https://app.loops.so/api/v1"),
  attio: get("https://api.attio.com", "accessToken"),
  folk: get("https://api.folk.app/v1"),
  teamup: get(
    "https://api.teamup.com",
    "teamupToken",
    "Teamup-Token",
    "{{teamupToken}}",
  ),
  circleci: get(
    "https://circleci.com/api/v2",
    "apiKey",
    "Circle-Token",
    "{{apiKey}}",
  ),
  datadog: get(
    "https://api.datadoghq.com",
    "apiKey",
    "DD-API-KEY",
    "{{apiKey}}",
  ),
  rollbar: get(
    "https://api.rollbar.com/api/1",
    "apiKey",
    "X-Rollbar-Access-Token",
    "{{apiKey}}",
  ),
  "capsule-crm": get("https://api.capsulecrm.com/api/v2"),
  capsule_crm: { ...get("https://api.capsulecrm.com/api/v2"), appcallId: "capsule-crm", templateKey: "capsule-crm" },
  salesflare: get("https://api.salesflare.com"),
  pexels: get(
    "https://api.pexels.com/v1",
    "apiKey",
    "Authorization",
    "{{apiKey}}",
  ),
  webflow: get("https://api.webflow.com/v2"),
  "buildkite": get("https://api.buildkite.com/v2", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  "better-stack": get("https://uptime.betterstack.com", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  better_stack: { ...get("https://uptime.betterstack.com", "apiKey", "Authorization", "Bearer {{apiKey}}"), appcallId: "better-stack", templateKey: "better-stack" },
  "axiom": get("https://api.axiom.co", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  "simple-analytics": get("https://simpleanalytics.com", "apiKey", "Api-Key", "{{apiKey}}"),
  simple_analytics: { ...get("https://simpleanalytics.com", "apiKey", "Api-Key", "{{apiKey}}"), appcallId: "simple-analytics", templateKey: "simple-analytics" },
  "productboard": get("https://api.productboard.com/v2", "accessToken", "Authorization", "Bearer {{accessToken}}"),
  "featurebase": get("https://do.featurebase.app", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  "shortcut": get("https://api.app.shortcut.com/api/v3", "apiKey", "Shortcut-Token", "{{apiKey}}"),
  "canny": { ...get("https://canny.io/api", "apiKey"), httpAuth: { field: "apiKey", in: "body", name: "apiKey", value: "{{apiKey}}" } },
  "mixpanel": { ...get("https://mixpanel.com", "serviceAccountSecret"), httpAuth: { field: "serviceAccountSecret", in: "header", name: "Authorization", basic: { username: "{{serviceAccountUsername}}", password: "{{serviceAccountSecret}}" } } },
  "toggl": { ...get("https://api.track.toggl.com/api/v9"), httpAuth: { field: "apiKey", in: "header", name: "Authorization", basic: { username: "{{apiKey}}", password: "api_token" } } },
  "harvest": get("https://api.harvestapp.com", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  "miro": { ...get("https://api.miro.com/v2", "accessToken"), authType: "oauth2", setupMode: "oauth2", allowedHosts: ["api.miro.com", "miro.com"], oauth: { authorizeUrl: "https://miro.com/oauth/authorize", tokenUrl: "https://api.miro.com/v1/oauth/token" } },
  "float": get("https://api.float.com/v3", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  "front": get("https://api2.frontapp.com", "apiKey", "Authorization", "Bearer {{apiKey}}"),
  "close": { ...get("https://api.close.com"), httpAuth: { field: "apiKey", in: "header", name: "Authorization", basic: { username: "{{apiKey}}", password: "" } } },
  "freshdesk": { ...get("https://{{domainAlias}}.freshdesk.com/api/v2"), allowedHosts: ["*.freshdesk.com"], httpAuth: { field: "apiKey", in: "header", name: "Authorization", basic: { username: "{{apiKey}}", password: "X" } } },
  "freshsales": { ...get("https://{{bundleAlias}}.myfreshworks.com/crm/sales/api"), allowedHosts: ["*.myfreshworks.com"], httpAuth: { field: "apiKey", in: "header", name: "Authorization", value: "Token token={{apiKey}}" } }
};

const authoredOperationMethods = {
  coda: {
    operationMethods: {
      healthcheck: "GET",
      "docs.list": "GET",
      "docs.get": "GET",
      "pages.list": "GET",
      "tables.list": "GET",
      "columns.list": "GET",
      "rows.list": "GET",
    },
  },
  helpscout: {
    operationMethods: {
      healthcheck: "GET",
      "inboxes.list": "GET",
      "users.list": "GET",
      "tags.list": "GET",
      "conversations.list": "GET",
      "conversations.get": "GET",
      "threads.list": "GET",
    },
  },
  kit: {
    operationMethods: {
      healthcheck: "GET",
      "subscribers.list": "GET",
      "subscribers.get": "GET",
      "forms.list": "GET",
    },
  },
  beehiiv: {
    operationMethods: {
      healthcheck: "GET",
      "publications.list": "GET",
      "publications.get": "GET",
      "posts.list": "GET",
      "subscriptions.list": "GET",
    },
  },
  clockify: {
    operationMethods: {
      healthcheck: "GET",
      "workspaces.list": "GET",
      "projects.list": "GET",
      "tasks.list": "GET",
    },
  },
  wrike: {
    operationMethods: {
      healthcheck: "GET",
      "contacts.list": "GET",
      "folders.list": "GET",
      "folders.get": "GET",
      "tasks.list": "GET",
      "tasks.get": "GET",
    },
  },
  smartsheet: {
    operationMethods: {
      healthcheck: "GET",
      "sheets.list": "GET",
      "sheets.get": "GET",
    },
  },
  buttondown: {
    operationMethods: {
      healthcheck: "GET",
      "account.get": "GET",
      "newsletters.list": "GET",
      "subscribers.list": "GET",
      "subscribers.get": "GET",
    },
  },
  loops: {
    operationMethods: {
      healthcheck: "GET",
      "contacts.find": "GET",
      "contact_properties.list": "GET",
      "mailing_lists.list": "GET",
    },
  },
  attio: {
    operationMethods: {
      healthcheck: "GET",
      "objects.list": "GET",
      "objects.get": "GET",
      "attributes.list": "GET",
      "records.list": "POST",
      "records.get": "GET",
    },
  },
  folk: {
    operationMethods: {
      healthcheck: "GET",
      "users.list": "GET",
      "users.get": "GET",
      "groups.list": "GET",
      "people.list": "GET",
      "people.get": "GET",
      "companies.list": "GET",
      "companies.get": "GET",
    },
  },
  canny: {
    operationMethods: {
      healthcheck: "POST",
      "boards.list": "POST",
      "boards.get": "POST",
      "posts.list": "POST",
      "posts.get": "POST",
    },
  },
  mixpanel: {
    operationMethods: {
      healthcheck: "GET",
      "cohorts.list": "POST",
      "funnels.list": "GET",
      "funnel.query": "GET",
    },
  },
  teamup: {
    operationMethods: {
      healthcheck: "GET",
      "events.list": "GET",
      "events.get": "GET",
    },
  },
  circleci: {
    operationMethods: {
      healthcheck: "GET",
      "projects.get": "GET",
      "pipelines.list": "GET",
      "pipelines.get": "GET",
    },
  },
  datadog: {
    operationMethods: {
      healthcheck: "GET",
      "monitors.list": "GET",
      "monitors.get": "GET",
      "metrics.list": "GET",
    },
  },
  rollbar: {
    operationMethods: {
      healthcheck: "GET",
      "projects.get": "GET",
      "items.list": "GET",
      "items.get": "GET",
    },
  },
  "capsule-crm": {
    operationMethods: {
      healthcheck: "GET",
      "parties.list": "GET",
      "opportunities.list": "GET",
      "projects.list": "GET",
    },
  },
  salesflare: {
    operationMethods: {
      healthcheck: "GET",
      "contacts.list": "GET",
      "accounts.list": "GET",
      "opportunities.list": "GET",
    },
  },
  pexels: {
    operationMethods: {
      healthcheck: "GET",
      search_photos: "GET",
      curated_photos: "GET",
      get_photo: "GET",
    },
  },
  webflow: {
    operationMethods: {
      healthcheck: "GET",
      list_sites: "GET",
      list_collections: "GET",
      list_collection_items: "GET",
    },
  },
  "capsule_crm": { operationMethods: {
      "healthcheck": "GET",
      "parties.list": "GET",
      "opportunities.list": "GET",
    },
  },
  "buildkite": { operationMethods: {
      "healthcheck": "GET",
      "organizations.list": "GET",
      "pipelines.list": "GET",
      "builds.list": "GET",
    },
  },
  "better-stack": { operationMethods: {
      "healthcheck": "GET",
      "incidents.list": "GET",
      "incidents.get": "GET",
    },
  },
  better_stack: { operationMethods: {
      healthcheck: "GET", "incidents.list": "GET", "incidents.get": "GET",
    },
  },
  "axiom": { operationMethods: {
      "healthcheck": "GET",
      "datasets.list": "GET",
      "datasets.get": "GET",
    },
  },
  "simple-analytics": { operationMethods: {
      "healthcheck": "GET",
      "websites.list": "GET",
      "stats.get": "GET",
    },
  },
  simple_analytics: { operationMethods: {
      healthcheck: "GET", "websites.list": "GET", "stats.get": "GET",
    },
  },
  "productboard": { operationMethods: {
      "healthcheck": "GET",
      "entities.list": "GET",
      "entities.get": "GET",
      "notes.list": "GET",
      "notes.get": "GET",
      "members.list": "GET",
      "members.get": "GET",
    },
  },
  "featurebase": { operationMethods: {
      "healthcheck": "GET",
      "boards.list": "GET",
      "boards.get": "GET",
      "posts.list": "GET",
      "posts.get": "GET",
      "contacts.list": "GET",
      "contacts.get": "GET",
    },
  },
  "shortcut": { operationMethods: {
      "healthcheck": "GET",
      "projects.list": "GET",
      "projects.get": "GET",
      "stories.list": "GET",
      "stories.get": "GET",
    },
  },
  "toggl": { operationMethods: {
      "healthcheck": "GET",
      "users.me": "GET",
      "workspaces.list": "GET",
      "projects.list": "GET",
      "tasks.list": "GET",
      "timeEntries.list": "GET",
    },
  },
  "harvest": { operationMethods: {
      "healthcheck": "GET",
      "users.me": "GET",
      "clients.list": "GET",
      "projects.list": "GET",
      "tasks.list": "GET",
      "timeEntries.list": "GET",
    },
  },
  "miro": { operationMethods: {
      "healthcheck": "GET",
      "boards.list": "GET",
      "boards.get": "GET",
      "items.list": "GET",
      "items.get": "GET",
    },
  },
  "float": { operationMethods: {
      "healthcheck": "GET",
      "accounts.list": "GET",
      "people.list": "GET",
      "clients.list": "GET",
      "projects.list": "GET",
      "allocations.list": "GET",
    },
  },
  "front": { operationMethods: {
      "healthcheck": "GET",
      "contacts.list": "GET",
      "contacts.get": "GET",
      "teammates.list": "GET",
    },
  },
  "close": { operationMethods: {
      "healthcheck": "GET",
      "leads.list": "GET",
      "leads.get": "GET",
      "contacts.list": "GET",
      "contacts.get": "GET",
      "tasks.list": "GET",
      "tasks.get": "GET",
      "opportunities.list": "GET",
      "opportunities.get": "GET",
    },
  },
  "freshdesk": { operationMethods: {
      "healthcheck": "GET",
      "account.get": "GET",
      "tickets.list": "GET",
      "tickets.get": "GET",
      "tickets.conversations.list": "GET",
    },
  },
  "freshsales": { operationMethods: {
      "healthcheck": "GET",
      "contacts.filters.list": "GET",
      "contacts.list": "GET",
      "contacts.get": "GET",
      "accounts.list": "GET",
      "deals.list": "GET",
    },
  },} as const;
for (const [key, methods] of Object.entries(authoredOperationMethods))
  Object.assign(approvedContracts[key], methods);
