import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest);
const response=(body:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(body),{status,headers});
describe("Kit read-only contract",()=>{
 test("healthcheck sends X-Kit-Api-Key and maps account",async()=>{const seen:Request[]=[];const r=await actions.healthcheck!({apiKey:"secret",fetch:async(i,x)=>{seen.push(new Request(i,x));return response({account:{id:1},user:{id:2}})}});expect(seen[0].headers.get("x-kit-api-key")).toBe("secret");expect(r.account).toEqual({id:1});});
 test("cursor list maps pagination and does not follow next URL",async()=>{const seen:Request[]=[];const r=await actions["subscribers.list"]!({apiKey:"tok",per_page:10,fetch:async(i,x)=>{seen.push(new Request(i,x));return response({subscribers:[{id:3}],pagination:{has_next_page:true,end_cursor:"next"},next_url:"https://evil.example"})}});expect(new URL(seen[0].url).searchParams.get("per_page")).toBe("10");expect(r.subscribers).toHaveLength(1);expect(seen).toHaveLength(1);});
 test("rejects invalid IDs and upstream errors safely",async()=>{await expect(actions["subscribers.get"]!({apiKey:"tok",id:undefined,fetch:async()=>response({})})).rejects.toMatchObject({code:"INVALID_ACTION_INPUT"});await expect(actions["subscribers.list"]!({apiKey:"secret",fetch:async()=>response({message:"bad",apiKey:"secret"},401)})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});await expect(actions["subscribers.list"]!({apiKey:"secret",fetch:async()=>response({message:"slow"},429,{"Retry-After":"7"})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:7});});
});
