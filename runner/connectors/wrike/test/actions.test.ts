import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import contacts from "../fixtures/contacts.json";
const { actions } = compileDeclarativeConnector(manifest);
const response=(body:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(body),{status,headers});
describe("Wrike read-only contract",()=>{
 test("healthcheck sends bearer and maps data",async()=>{const seen:Request[]=[];const r=await actions.healthcheck!({apiKey:"secret",fetch:async(i,x)=>{seen.push(new Request(i,x));return response(contacts)}});expect(seen[0].url).toBe("https://www.wrike.com/api/v4/contacts?me=true");expect(seen[0].headers.get("authorization")).toBe("Bearer secret");expect(r.contacts).toEqual(contacts.data)});
 test("encodes path and omits missing query values",async()=>{const seen:Request[]=[];await actions["folders.get"]!({apiKey:"tok",folderId:"a/b?c",fetch:async(i,x)=>{seen.push(new Request(i,x));return response({data:[]})}});expect(new URL(seen[0].url).pathname).toBe("/api/v4/folders/a%2Fb%3Fc");expect(seen).toHaveLength(1)});
 test("maps rate limits and rejects malformed output",async()=>{await expect(actions["contacts.list"]!({apiKey:"tok",fetch:async()=>response({data:{} })})).rejects.toMatchObject({code:"CONNECTOR_RESPONSE_INVALID"});await expect(actions["contacts.list"]!({apiKey:"secret",fetch:async()=>response({message:"x",secret:"secret"},429,{"Retry-After":"7"})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:7})});
});
