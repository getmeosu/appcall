import { expect, test } from "bun:test";
import manifest from "../manifest.json";
import template from "../../../../scripts/connector-gen/openconnector/templates/beehiiv.json";

test("deepened Beehiiv manifest preserves template operations with strict defaults", () => {
  for (const [key, operation] of Object.entries(template.operations)) {
    expect(manifest.operations[key], key).toEqual({
      ...operation,
      responseFormat: "json",
      validationMode: "strict-generated",
    });
  }
});
