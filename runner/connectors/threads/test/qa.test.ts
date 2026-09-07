import { expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import fixtures from "../fixtures/contracts.json";
import qa from "../qa.json";

type Assertion = {path:string; op:string; value?:unknown};
function accepts(output: unknown, assertion: Assertion): boolean {
  const value = assertion.path.split(".").reduce<unknown>((current, key) =>
    current !== null && typeof current === "object" ? (current as Record<string,unknown>)[key] : undefined, output);
  switch(assertion.op) {
    case "eq": return value === assertion.value;
    case "isObject": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "type": return (Array.isArray(value) ? "array" : value === null ? "null" : typeof value) === assertion.value;
    case "matches": return typeof value === "string" && new RegExp(String(assertion.value)).test(value);
    default: throw new Error(`Unsupported probe assertion: ${assertion.op}`);
  }
}
const { actions } = compileDeclarativeConnector(manifest as never);
for (const scenario of qa.scenarios) {
  it(`${scenario.operation} requires a real read-only provider result`, async()=> {
    expect((manifest.operations as Record<string,{sideEffect:string}>)[scenario.operation]!.sideEffect).toBe("read");
    expect(scenario.expect.status).toBe("ok");
    const fixture = fixtures.find(f=>f.op===scenario.operation)!;
    let calls=0;
    const output=await actions[scenario.operation]!({...scenario.input,accessToken:"test-token",pageId:"page123",fetch:async()=>{
      calls++; return Response.json(fixture.response);
    }});
    expect(calls).toBe(1);
    expect(scenario.expect.assertions.every(a=>accepts(output,a))).toBe(true);
    const echo = await actions[scenario.operation]!(scenario.input);
    expect(scenario.expect.assertions.every(a=>accepts(echo,a))).toBe(false);
    expect(scenario.expect.assertions.every(a=>accepts({...output,source:"connector"},a))).toBe(false);
  });
}
it("rejects absent, empty and whitespace-only account identifiers",async()=>{
  const scenario=qa.scenarios.find(s=>s.operation==="healthcheck")!;
  const fixture=fixtures.find(f=>f.op==="healthcheck")!;
  const identityKey="id";
  for(const id of [undefined,"","   "]) {
    const response = {...fixture.response, [identityKey]:id};
    const output=await actions.healthcheck!({accessToken:"test-token",pageId:"page123",fetch:async()=>Response.json(response)});
    expect(scenario.expect.assertions.every(a=>accepts(output,a))).toBe(false);
  }
});
