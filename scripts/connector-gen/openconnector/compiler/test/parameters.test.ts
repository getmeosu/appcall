import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { parseModule } from "../ast";
import { lowerRequestParameters } from "../parameters";

const lower = (source: string) => {
  const module = parseModule("parameters.ts", source);
  const fn = module.functions.get("request")!;
  let options: ts.Expression | undefined;
  fn.forEachChild(function visit(node) { if (ts.isCallExpression(node) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) options = node.arguments[0]; node.forEachChild(visit); });
  return lowerRequestParameters(options!, module);
};

describe("request parameter lowering", () => {
  test("lowers encoded paths and literal query input fields", () => {
    expect(lower('function request(input) { return fetch({path: `/foo/${encodeURIComponent(input.id)}`, query: {q: input.q, page: 2}}); }')).toEqual({ status: "PROVEN", path: "/foo/{{input.id}}", query: { q: "{{input.q}}", page: "2" }, holds: [] });
  });
  test("accepts the verified optionalString helper", () => {
    expect(lower('import { optionalString } from "../../core/cast"; function request(input) { return fetch({path: "/foo", query: {q: optionalString(input.q)}}); }').query).toEqual({ q: "{{input.q}}" });
  });
  test("holds dynamic spreads and arbitrary calls", () => {
    expect(lower('function request(input) { return fetch({path: input.url, query: {...input.query}}); }').status).toBe("HOLD");
    expect(lower('function request(input) { return fetch({path: "/foo", query: {q: make(input.q)}}); }').holds[0]?.code).toBe("PARAMETERS_VALUE_UNSUPPORTED");
  });
});
