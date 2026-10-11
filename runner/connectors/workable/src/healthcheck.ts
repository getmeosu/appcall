import { executeWorkableAction } from "./actions";

export async function healthcheck(input?: unknown): Promise<Record<string, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { connector: "workable", status: "ok", source: "connector" };
  }
  const token = (input as { accessToken?: unknown }).accessToken;
  if (typeof token !== "string" || token.length === 0) {
    return { connector: "workable", status: "ok", source: "connector" };
  }
  await executeWorkableAction("healthcheck", input);
  return { status: "ok", source: "provider" };
}
