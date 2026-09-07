// runner/sena-e2e/config.ts
// Central config for the Sena sales-workflow harness, read from the environment.
// No secrets are hardcoded; live keys are supplied by the operator's shell.

export type SendMode = "dry_run" | "live_single" | "live_bulk";

export interface HarnessConfig {
  baseUrl: string;          // appcall API, e.g. http://localhost:5080
  apiKey: string;           // X-API-Key
  externalAccountId: string;// X-External-Account-Id (the Sena brand)
  capabilityProfile: string;// X-Capability-Profile
  sendMode: SendMode;
  testRecipientEmail: string;   // live_single email override target
  testRecipientProfile: string; // live_single LinkedIn/DM override target
  calendlyToken: string;        // X-Connector-Token for Calendly (PAT or OAuth)
  calendlyEventType: string;    // event_type URI for scheduling_links.create
  maxLeads: number;             // hard cap on leads processed per run
  allowBulk: boolean;           // must be true for live_bulk
  stateDir: string;             // where leads.csv + evidence.jsonl are written
}

function parseMaxLeads(raw: string | undefined): number {
  const n = Number(raw ?? "1");
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`invalid MAX_LEADS: ${raw} (must be a finite number >= 1)`);
  }
  return Math.floor(n);
}

function parseSendMode(raw: string | undefined): SendMode {
  switch (raw) {
    case "live_single":
      return "live_single";
    case "live_bulk":
      return "live_bulk";
    case "dry_run":
    case undefined:
    case "":
      return "dry_run";
    default:
      throw new Error(`invalid SEND_MODE: ${raw}`);
  }
}

export function loadConfig(env = process.env, argv = process.argv): HarnessConfig {
  const flag = (name: string) => argv.includes(name);
  const modeFromArg = argv.find((a) => a.startsWith("--mode="))?.split("=")[1];
  return {
    baseUrl: env.APPCALL_BASE_URL ?? "http://localhost:5080",
    apiKey: env.APPCALL_DEV_API_KEY ?? "ak_dev_local",
    externalAccountId: env.SENA_ACCOUNT_ID ?? "sena",
    capabilityProfile: env.SENA_CAPABILITY_PROFILE ?? "sena_mvt",
    sendMode: parseSendMode(modeFromArg ?? env.SEND_MODE),
    testRecipientEmail: env.TEST_RECIPIENT_EMAIL ?? "",
    testRecipientProfile: env.TEST_RECIPIENT_PROFILE ?? "",
    calendlyToken: env.CALENDLY_TOKEN ?? "",
    calendlyEventType: env.CALENDLY_EVENT_TYPE ?? "",
    maxLeads: parseMaxLeads(env.MAX_LEADS),
    allowBulk: flag("--allow-bulk"),
    stateDir: env.SENA_STATE_DIR ?? "runner/sena-e2e/state",
  };
}
