import { describe,expect,test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import member from "../fixtures/member.json";
const {actions}=compileDeclarativeConnector(manifest);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
describe("shortcut HTTP contract",()=>{
 test("uses Shortcut-Token and healthcheck accepts empty input",async()=>{const seen:Request[]=[];const out=await actions.healthcheck!({apiKey:"secret",fetch:async(i,x)=>{seen.push(new Request(i,x));return response(member)}});expect(seen[0]!.headers.get("shortcut-token")).toBe("secret");expect(seen[0]!.url).toBe("https://api.app.shortcut.com/api/v3/member");expect(out).toMatchObject({member});});
 test("encodes numeric path and rejects missing input before fetch",async()=>{const seen:Request[]=[];await actions["projects.get"]!({apiKey:"secret",projectId:3,fetch:async(i,x)=>{seen.push(new Request(i,x));return response({id:3})}});expect(seen[0]!.url).toContain("/projects/3");await expect(actions["projects.get"]!({apiKey:"secret",fetch:async()=>response({})})).rejects.toBeDefined();});
 test("maps upstream errors safely",async()=>{await expect(actions["projects.list"]!({apiKey:"secret",fetch:async()=>response({message:"bad secret"},401)})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});});
});
