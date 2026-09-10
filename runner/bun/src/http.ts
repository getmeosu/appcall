import { executionContext } from "./execution";
import { maxOperationResponseBytes, maxOperationTimeoutMs } from "./budget";
export type ConnectorHttpClientOptions = {
  allowedHosts: string[];
  maxResponseBytes: number;
  /**
   * Per-request deadline. Every outbound call is aborted when it expires, so a
   * provider that accepts a connection and then stalls cannot hold a runner
   * request open indefinitely.
   *
   * This is where cancellation has to live: racing a timer against the handler
   * promise (as the operation timeout does) returns control to the caller but
   * leaves the request in flight — for a side-effecting send that means the
   * caller is told "timeout" while the message may still be delivered.
   */
  timeoutMs?: number;
  fetch?: typeof fetch;
};

// Applied when the caller supplies no deadline. Chosen above the slowest
// manifest operation timeout so it acts as a backstop rather than as the
// effective limit.
export const defaultOutboundTimeoutMs = maxOperationTimeoutMs;

export type ConnectorHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type ConnectorHttpErrorCode =
  | "OUTBOUND_HOST_NOT_ALLOWED"
  | "OUTBOUND_INVALID_URL"
  | "OUTBOUND_REDIRECT_BLOCKED"
  | "OUTBOUND_RESPONSE_TOO_LARGE"
  | "OUTBOUND_UNSUPPORTED_BUDGET"
  | "OUTBOUND_TIMEOUT";

export class ConnectorHttpError extends Error {
  readonly code: ConnectorHttpErrorCode;

  constructor(code: ConnectorHttpErrorCode, message: string) {
    super(message);
    this.name = "ConnectorHttpError";
    this.code = code;
  }
}

export type ConnectorHttpClient = {
  fetchText(input: string | URL, init?: RequestInit): Promise<ConnectorHttpResponse>;
};

/**
 * hostIsAllowed matches an outbound hostname against the manifest allowlist.
 *
 * An entry may be an exact host ("api.example.com") or a single-label wildcard
 * ("*.example.com"), which matches any subdomain but never the bare domain and
 * never a different registrable domain. The wildcard form exists for providers
 * whose host embeds tenant input — Recruitee serves each customer from
 * <company>.recruitee.com — where an exact list cannot be written ahead of time.
 * Matching on the parsed URL's hostname (not the raw string) is what stops a
 * crafted tenant value from steering the request off-domain.
 */
export function hostIsAllowed(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((entry) => {
    const allowed = entry.toLowerCase();
    if (allowed.startsWith("*.")) {
      const suffix = allowed.slice(1); // ".example.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === allowed;
  });
}

export function createConnectorHttpClient(options: ConnectorHttpClientOptions): ConnectorHttpClient {
  const allowedHosts = options.allowedHosts;
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs === undefined ? defaultOutboundTimeoutMs : options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > maxOperationTimeoutMs) {
    throw new ConnectorHttpError(
      "OUTBOUND_UNSUPPORTED_BUDGET",
      "Outbound timeout exceeds the runner budget contract.",
    );
  }
  if (!Number.isSafeInteger(options.maxResponseBytes)
      || options.maxResponseBytes <= 0
      || options.maxResponseBytes > maxOperationResponseBytes) {
    throw new ConnectorHttpError(
      "OUTBOUND_UNSUPPORTED_BUDGET",
      "Outbound response budget exceeds the runner budget contract.",
    );
  }

  return {
    async fetchText(input: string | URL, init: RequestInit = {}): Promise<ConnectorHttpResponse> {
      const url = parseOutboundURL(input);
      if (!hostIsAllowed(url.hostname, allowedHosts)) {
        throw new ConnectorHttpError(
          "OUTBOUND_HOST_NOT_ALLOWED",
          "Outbound host is not allowed for this connector.",
        );
      }

      // A caller-supplied signal still wins; the deadline is layered on top so a
      // connector that already cancels does not lose that behavior.
      const controller = new AbortController();
      const abortForTimeout = () => controller.abort(new ConnectorHttpError(
        "OUTBOUND_TIMEOUT",
        "Outbound request exceeded the connector HTTP timeout.",
      ));
      const timer = setTimeout(abortForTimeout, timeoutMs);
      const context = executionContext();
      const callerSignal = init.signal ?? undefined;
      const signals = [callerSignal, context?.signal].filter((s): s is AbortSignal => !!s);
      const forwardAbort = () => controller.abort(signals.find(s => s.aborted)?.reason);
      for (const signal of signals) { if (signal.aborted) forwardAbort(); signal.addEventListener("abort", forwardAbort, { once: true }); }

      try {
        controller.signal.throwIfAborted();
        const response = await fetchImpl(url.toString(), {
          ...init,
          redirect: "manual",
          signal: controller.signal,
        });
        if (isRedirectStatus(response.status)) {
          throw new ConnectorHttpError(
            "OUTBOUND_REDIRECT_BLOCKED",
            "Outbound redirects are blocked by the connector HTTP boundary.",
          );
        }

        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await readBoundedText(response, options.maxResponseBytes, controller.signal),
        };
      } catch (error) {
        // fetch reports an abort as its own error type; surface the reason we
        // aborted for, so a timeout is not reported as a generic network fault.
        if (controller.signal.aborted && controller.signal.reason instanceof ConnectorHttpError) {
          throw controller.signal.reason;
        }
        throw error;
      } finally {
        clearTimeout(timer);
        for (const signal of signals) signal.removeEventListener("abort", forwardAbort);
      }
    },
  };
}

function parseOutboundURL(input: string | URL): URL {
  try {
    const url = input instanceof URL ? input : new URL(input);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Unsafe URL");
    return url;
  } catch {
    throw new ConnectorHttpError("OUTBOUND_INVALID_URL", "Outbound URL is invalid.");
  }
}

async function readBoundedText(response: Response, maxResponseBytes: number, signal: AbortSignal): Promise<string> {
  if (maxResponseBytes < 0) {
    throw new ConnectorHttpError(
      "OUTBOUND_RESPONSE_TOO_LARGE",
      "Outbound response exceeded the configured byte limit.",
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const cancel = () => { void reader.cancel(signal.reason); };
  signal.addEventListener("abort", cancel, {once:true});
  try {
  signal.throwIfAborted();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    signal.throwIfAborted();
    if (done) {
      break;
    }
    bytesRead += value.byteLength;
    if (bytesRead > maxResponseBytes) {
      await reader.cancel();
      throw new ConnectorHttpError(
        "OUTBOUND_RESPONSE_TOO_LARGE",
        "Outbound response exceeded the configured byte limit.",
      );
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(joinChunks(chunks, bytesRead));
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

function joinChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}
