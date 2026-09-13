import { expect, test } from "bun:test";
import manifest from "../manifest.json";
import template from "../../../../scripts/connector-gen/openconnector/templates/kit.json";
test("Kit template is an independent exact manifest copy", () => expect(template).toEqual(manifest));
