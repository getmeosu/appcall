export const supportedProtocolVersion = "2026-05-14";

export type RunnerMethod =
  | "runner.describe"
  | "connector.describe"
  | "connector.healthcheck"
  | "connector.action.execute"
  | "connector.sync.list"
  | "connector.webhook.verify"
  | "connector.webhook.parse";

export type RequestEnvelope = {
  id?: string;
  deadlineUnixMs?: number;
  method?: RunnerMethod;
  params?: Record<string, unknown>;
};

export type ResponseEnvelope = {
  id?: string;
  ok: boolean;
  result?: unknown;
  error?: {
    retryAfterSeconds?: number;
    code: string;
    message: string;
  };
};
