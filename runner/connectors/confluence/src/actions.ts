import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { findTextSelections } from "./find-text";

const compiled = compileDeclarativeConnector(manifest as never);

export function createConfluenceActionHandlers(): Record<string, (input: unknown) => unknown> {
  return {
    ...compiled.actions,
    "page.findText": findTextSelections,
  };
}
