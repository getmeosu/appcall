import catalog from "./catalog.json";
import manifest from "../manifest.json";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { callBaselinker, compactParameters, isObjectRecord } from "./http";

type CatalogEntry = {
  tool: string;
  operation: string;
  method: string;
};

type ManifestOperation = {
  inputSchema?: Record<string, unknown>;
};

const CREDENTIAL_KEYS = new Set(["apiKey", "fetch"]);
const catalogEntries = catalog as CatalogEntry[];

function hasCredential(input: unknown): boolean {
  return isObjectRecord(input) && typeof input.apiKey === "string" && input.apiKey.length > 0;
}

function invalidInput(error: unknown): Promise<never> {
  if (isObjectRecord(error) && error.ok === false) return Promise.reject(error);
  return Promise.reject({
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message: error instanceof Error ? error.message : "Action input is invalid.",
  });
}

function makeHandler(operationKey: string, method: string) {
  const operation = (manifest.operations as Record<string, ManifestOperation>)[operationKey];
  const schema = (operation?.inputSchema ?? { type: "object" }) as Parameters<typeof validateStrictInput>[1];
  return (input: unknown) => {
    if (!hasCredential(input)) {
      const validated = validateStrictInput(input, schema, CREDENTIAL_KEYS);
      return {
        connector: "baselinker",
        action: operationKey,
        source: "connector",
        validated,
      };
    }
    try {
      const validated = validateStrictInput(input, schema, CREDENTIAL_KEYS);
      const record = input as Record<string, unknown>;
      return callBaselinker({
        apiKey: record.apiKey as string,
        fetch: typeof record.fetch === "function" ? record.fetch as typeof fetch : undefined,
        operation: operationKey,
        method,
        parameters: compactParameters(validated),
      });
    } catch (error) {
      return invalidInput(error);
    }
  };
}

export const baselinkerActions: Record<string, (input: unknown) => unknown> = {
  healthcheck: makeHandler("healthcheck", "getOrderStatusList"),
};

for (const entry of catalogEntries) {
  baselinkerActions[entry.operation] = makeHandler(entry.operation, entry.method);
}

export const BASELINKER_ACTION_KEYS = Object.keys(baselinkerActions);

export function executeBaselinkerAction(operation: string, input: unknown): unknown {
  const handler = baselinkerActions[operation];
  if (!handler) throw new Error(`Unknown BaseLinker operation: ${operation}`);
  return handler(input);
}
