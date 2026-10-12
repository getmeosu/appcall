// SEC-PATH-2c-3: the runner registers these compiled declarative handlers (and
// the healthcheck) for bamboohr so host-bound setup fields are checked first
// (INVALID_ACTION_INPUT before any request, zendesk 2c-2 pattern).
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { assertHostLabel } from "../../_shared/jobboard";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);

type Handler = (input: unknown) => unknown;
function guarded(handler: Handler): Handler {
  return (input: unknown) => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) return handler(input);
    const record = { ...(input as Record<string, unknown>) };
    record.companyDomain = assertHostLabel(record.companyDomain, "companyDomain");
    return handler(record);
  };
}

export const bamboohrGuardedActions: Record<string, Handler> = Object.fromEntries(
  Object.entries(compiled.actions as Record<string, Handler>).map(([key, handler]) => [key, guarded(handler)]),
);
export const bamboohrGuardedHealthcheck = (input?: unknown) => bamboohrGuardedActions.healthcheck!(input ?? {});
