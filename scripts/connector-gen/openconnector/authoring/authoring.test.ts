import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { materializeAuthoring, validateAuthoringInput, type AuthoringInput } from "./index";

const base = (): AuthoringInput => ({
  providerId:"synthetic", appcallId:"synthetic", categories:["utility"], models:["record"],
  source:{url:"https://github.com/oomol-lab/open-connector",revision:"33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",files:{"src/providers/synthetic/actions.ts":"a".repeat(64)},spans:{op:{path:"src/providers/synthetic/actions.ts",startLine:1,endLine:1}}},
  selection:{providerId:"synthetic",appcallId:"synthetic",disposition:"HOLD",edition:"synthetic",operations:["healthcheck"],upstreamSha:"33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",marketFocus:"unknown",ownership:{},aliases:[],research:{},breach:{},exception:{},quality:{},gates:[]}, research:{decision:"HOLD"},
  auth:{type:"api_key",scopes:[],setup:{mode:"api_key",fields:[{key:"token",label:"Token",required:true,secret:true}]}}, network:{allowedHosts:["api.example.test"]}, http:{baseUrl:"https://api.example.test",auth:{field:"token",in:"header",name:"Authorization",value:"Bearer {{token}}"},errors:{}}, defaults:{timeoutMs:5000,maxInputBytes:4096,maxResponseBytes:65536},
  rows:[{id:"healthcheck",upstreamActionId:"get_current_user",sourceRefs:["op"],documentationUrls:["https://api.example.test/docs"],responseContract:"appcall-provider-json-v1",adaptations:[],operation:{kind:"action",sideEffect:"read",title:"Health",description:"Health",inputSchema:{type:"object",properties:{},additionalProperties:false},outputSchema:{type:"object",properties:{data:{type:"object"}},additionalProperties:false},enforceOutputSchema:true,responseFormat:"json",validationMode:"strict-generated",request:{method:"GET",path:"/me",success:[200]}}}],
  fixtures:[{id:"health",operation:"healthcheck",input:{},credentials:{token:"fixture-token"},evidence:{source:"synthetic"},exchanges:[{request:{method:"GET",url:"https://api.example.test/me",headers:{authorization:"Bearer fixture-token"},body:null},response:{status:200,body:{data:{}}}}],expected:{kind:"success",result:{data:{}}}}]
});

test("materializes a canonical recipe and independent fixture files", async()=>{ const out=await materializeAuthoring(base()); expect(out.recipe.manifest.operations.healthcheck).toBeDefined(); expect((await readFile(join(out.recipeDir,"fixtures/cases/health.json"),"utf8")).includes("fixture-token")).toBe(true); });
for (const [name, mutate] of [
  ["unknown input field", (x:any)=>x.nope=true], ["duplicate operation ID", (x:any)=>x.rows.push({...x.rows[0]})], ["unknown fixture operation", (x:any)=>x.fixtures[0].operation="nope"],
  ["path traversal fixture", (x:any)=>x.fixtures[0].exchanges[0].request.url="https://api.example.test/../evil"], ["forged passed flag", (x:any)=>x.passed=true], ["missing policy", (x:any)=>delete x.selection.gates], ["missing auth", (x:any)=>delete x.auth.setup]
] as const) test(`rejects ${name}`,()=>{ const x:any=base(); mutate(x); expect(()=>validateAuthoringInput(x)).toThrow(); });

test("rejects unsafe fixture ids before creating any recipe directories", async () => {
  const x:any=base(); x.fixtures[0].id="../../../review-escape";
  await expect(materializeAuthoring(x)).rejects.toThrow(/fixture id|safe/i);
});

test("requires explicit expected union and preserves raw multi exchange data", async () => {
  const x:any=base();
  x.fixtures=[{id:"multi",operation:"healthcheck",input:{},credentials:{token:"fixture-token"},evidence:{source:"synthetic"},exchanges:[
    {request:{method:"GET",url:"https://api.example.test/me",headers:{authorization:"Bearer fixture-token"},body:null},response:{status:200,body:{step:1}}},
    {request:{method:"GET",url:"https://api.example.test/me?page=2",headers:{authorization:"Bearer fixture-token"},body:null},response:{status:200,body:{step:2}}}
  ],expected:{kind:"success",result:{data:{step:2}}}}];
  const out=await materializeAuthoring(x);
  const c=JSON.parse(await readFile(join(out.recipeDir,"fixtures/cases/multi.json"),"utf8"));
  expect(c.exchanges).toHaveLength(2); expect(c.expected.kind).toBe("success");
});
