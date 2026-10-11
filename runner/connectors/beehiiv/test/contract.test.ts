import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest);
const response=(body:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(body),{status,headers});
describe("Beehiiv read-only contract",()=>{
 test("healthcheck uses bearer auth",async()=>{const seen:Request[]=[];await actions.healthcheck!({apiKey:"secret",fetch:async(i,x)=>{seen.push(new Request(i,x));return response({data:[{id:"pub_1"}]})}});expect(seen[0].headers.get("authorization")).toBe("Bearer secret");expect(seen[0].url).toContain("limit=1");});
 test("encodes publication ID and does not follow links",async()=>{const seen:Request[]=[];const r=await actions["posts.list"]!({apiKey:"tok",publicationId:"pub/a",fetch:async(i,x)=>{seen.push(new Request(i,x));return response({data:[{id:"post_1"}],next_page:"https://evil.example"})}});expect(new URL(seen[0].url).pathname).toBe("/v2/publications/pub%2Fa/posts");expect(r.data).toHaveLength(1);expect(seen).toHaveLength(1);});
 test("validates input, malformed output, 401 and 429",async()=>{await expect(actions["subscriptions.list"]!({apiKey:"tok",publicationId:"",fetch:async()=>response({})})).rejects.toMatchObject({code:"INVALID_ACTION_INPUT"});await expect(actions["publications.list"]!({apiKey:"secret",fetch:async()=>response({data:{}},200)})).rejects.toMatchObject({code:"CONNECTOR_RESPONSE_INVALID"});await expect(actions["publications.list"]!({apiKey:"secret",fetch:async()=>response({},401)})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});await expect(actions["publications.list"]!({apiKey:"secret",fetch:async()=>response({},429,{"Retry-After":"4"})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:4});});
});
