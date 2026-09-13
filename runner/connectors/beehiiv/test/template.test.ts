import { expect, test } from "bun:test";
import manifest from "../manifest.json";
import template from "../../../../scripts/connector-gen/openconnector/templates/beehiiv.json";
test("Beehiiv template is an independent exact manifest copy", () => expect(template).toEqual(manifest));
