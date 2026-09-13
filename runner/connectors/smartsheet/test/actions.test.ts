import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import sheets from "../fixtures/sheets.json";
const { actions } = compileDeclarativeConnector(manifest); const response=(b:unknown,s=200,h?:HeadersInit)=>new Response(JSON.stringify(b),{status:s,headers:h});
describe("Smartsheet read-only contract",()=>{
 test("healthcheck bearer and bounded page",async()=>{const seen:Request[]=[];const r=await actions.healthcheck!({apiKey:"secret",fetch:async(i,x)=>{seen.push(new Request(i,x));return response(sheets)}});expect(seen[0].url).toBe("https://api.smartsheet.com/2.0/sheets?pageSize=1");expect(seen[0].headers.get("authorization")).toBe("Bearer secret");expect(r.sheets).toEqual(sheets.data)});
 test("maps upstream rate limits",async()=>{await expect(actions["sheets.list"]!({apiKey:"secret",fetch:async()=>response({message:"slow"},429,{"Retry-After":"3"})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:3})});
});
