import { AsyncLocalStorage } from "node:async_hooks";

export type ExecutionContext = {
  signal: AbortSignal;
  deadlineUnixMs: number;
  secrets: string[];
};

const contexts = new AsyncLocalStorage<ExecutionContext>();
export const executionContext = () => contexts.getStore();
export const timeoutError = () => ({
  ok: false,
  code: "OPERATION_TIMEOUT",
  message: "Operation exceeded the connector manifest timeout.",
});

// Each nested operation inherits the earlier deadline. Aborting the context
// cancels outbound HTTP and SMTP work before returning the timeout envelope.
export function runExecution<T>(
  fn: () => T,
  timeoutMs = 60_000,
  signal?: AbortSignal,
  deadlineUnixMs?: number,
  secrets?: string[],
): T | Promise<Awaited<T>> {
  const parent = contexts.getStore();
  const deadline = Math.min(
    Date.now() + timeoutMs,
    deadlineUnixMs ?? Infinity,
    parent?.deadlineUnixMs ?? Infinity,
  );
  const controller = new AbortController();
  const sources = [signal, parent?.signal].filter((s): s is AbortSignal => !!s);
  const abort = () => controller.abort(timeoutError());
  for (const source of sources) {
    if (source.aborted) abort();
    source.addEventListener("abort", abort, { once: true });
  }
  const removeListeners = () => {
    for (const source of sources) source.removeEventListener("abort", abort);
  };
  if (deadline <= Date.now()) abort();
  if (controller.signal.aborted) {
    removeListeners();
    throw timeoutError();
  }

  const timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
  const cleanup = () => {
    clearTimeout(timer);
    removeListeners();
  };
  try {
    const output = contexts.run({
      signal: controller.signal,
      deadlineUnixMs: deadline,
      secrets: secrets ?? parent?.secrets ?? [],
    }, fn);
    if (!output || typeof (output as { then?: unknown }).then !== "function") {
      cleanup();
      return output;
    }
    return new Promise<Awaited<T>>((resolve, reject) => {
      const onAbort = () => { cleanup(); reject(timeoutError()); };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(output).then(resolve, reject).finally(() => {
        controller.signal.removeEventListener("abort", onAbort);
        cleanup();
      });
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}

// Hand-written healthchecks also use native fetch. Attach the execution signal
// at this last boundary, so they obey the same deadline as compiled handlers.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const context = executionContext();
  if (!context) return nativeFetch(input, init);
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = callerSignal ? AbortSignal.any([context.signal, callerSignal]) : context.signal;
  signal.throwIfAborted();
  return nativeFetch(input, { ...init, signal });
}) as typeof fetch;
