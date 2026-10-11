type TikTokEnvelope = { code?: unknown; message?: unknown; data?: unknown };

export function wrapTikTokApiEnvelope<T extends (input: never) => Promise<unknown>>(handler: T) {
  return async (input: Parameters<T>[0]) => {
    const result = await handler(input);
    if (!result || typeof result !== "object") return result;
    const body = (result as { data?: unknown }).data;
    if (!body || typeof body !== "object" || !("code" in body)) return result;
    const envelope = body as TikTokEnvelope;
    if (envelope.code !== 0) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: typeof envelope.message === "string" ? envelope.message : "TikTok Ads rejected the request.",
      };
    }
    return { ...result, data: envelope.data };
  };
}
