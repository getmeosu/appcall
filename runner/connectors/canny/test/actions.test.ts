import { describe,expect,test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const {actions}=compileDeclarativeConnector(manifest);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
describe("canny HTTP contract",()=>{
 test("sends API key only in POST body and healthcheck accepts empty input",async()=>{const seen:Request[]=[];const out=await actions.healthcheck!({apiKey:"secret",fetch:async(i,x)=>{seen.push(new Request(i,x));return response({boards:[]})}});expect(seen[0]!.method).toBe("POST");expect(await seen[0]!.json()).toEqual({apiKey:"secret"});expect(seen[0]!.headers.get("authorization")).toBeNull();expect(out).toMatchObject({boards:[],source:"provider"});});
 test("uses documented POST read endpoint and bounded pagination",async()=>{const seen:Request[]=[];await actions["posts.list"]!({apiKey:"secret",boardId:"b1",limit:10,skip:20,fetch:async(i,x)=>{seen.push(new Request(i,x));return response({posts:[],hasMore:false})}});expect(seen[0]!.url).toBe("https://canny.io/api/v1/posts/list");expect(await seen[0]!.json()).toMatchObject({apiKey:"secret",boardID:"b1",limit:10,skip:20});});
 test("rejects invalid input before fetch and maps 429",async()=>{await expect(actions["boards.get"]!({apiKey:"secret",boardId:"",fetch:async()=>response({})})).rejects.toBeDefined();await expect(actions["boards.list"]!({apiKey:"secret",fetch:async()=>response({message:"slow"},429)})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED"});});
});
