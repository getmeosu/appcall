import { mkdtemp, mkdir, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readRecipe } from "../recipes";
import type { ReviewedRecipe } from "../recipe-types";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const own = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: unknown, required: string[], label: string, optional: string[] = []) => { const allowed = new Set([...required, ...optional]); if (!own(v) || Object.keys(v).some(k => !allowed.has(k))) throw new Error(`unknown ${label} field`); for (const k of required) if (!Object.hasOwn(v, k)) throw new Error(`missing ${label}.${k}`); };
const safe = (v: unknown) => typeof v === "string" && /^(?!\.\.?$)[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export type AuthoringExpected = {kind:"success"; result: unknown} | {kind:"error"; code:string; retryAfterSeconds?:number};
export type AuthoringFixture = { id: string; operation: string; input: Record<string, unknown>; credentials: Record<string, string>; evidence: Record<string, unknown>; exchanges: Array<{request:{method:string;url:string;headers?:Record<string,string>;body:null|string};response:{status:number;headers?:Record<string,string>;body:unknown}}>; expected: AuthoringExpected };
export type AuthoringRow = { id: string; upstreamActionId: string; sourceRefs: string[]; documentationUrls: string[]; responseContract: "preserve-existing"|"appcall-provider-json-v1"; adaptations: string[]; operation: Record<string, unknown> };
export type AuthoringInput = { providerId: string; appcallId: string; source: { url: string; revision: string; files: Record<string,string>; spans: Record<string,{path:string;startLine:number;endLine:number}> }; selection: Record<string,unknown>; research: Record<string,unknown>; auth: Record<string,unknown>; network: Record<string,unknown>; http: Record<string,unknown>; categories: string[]; models: string[]; rows: AuthoringRow[]; fixtures: AuthoringFixture[]; defaults: { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number } };

function validate(i: AuthoringInput) {
  exact(i, ["providerId","appcallId","source","selection","research","auth","network","http","categories","models","rows","fixtures","defaults"], "input");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(i.providerId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(i.appcallId)) throw new Error("invalid provider identity");
  exact(i.source,["url","revision","files","spans"],"source"); if (!own(i.selection) || Object.keys(i.selection).some(k=>!["providerId","appcallId","disposition","edition","operations","upstreamSha","marketFocus","ownership","aliases","research","breach","exception","quality","gates"].includes(k))) throw new Error("unknown selection field");
  if (i.selection.providerId !== i.providerId || i.selection.appcallId !== i.appcallId || i.selection.upstreamSha !== i.source.revision) throw new Error("selection identity or revision mismatch");
  if (!Array.isArray(i.categories) || i.categories.length === 0 || !i.categories.every(text) || !Array.isArray(i.models) || i.models.length === 0 || !i.models.every(text)) throw new Error("categories and models are required");
  exact(i.defaults,["timeoutMs","maxInputBytes","maxResponseBytes"],"defaults"); if (![i.defaults.timeoutMs,i.defaults.maxInputBytes,i.defaults.maxResponseBytes].every(n=>Number.isInteger(n)&&n>0)) throw new Error("bounded defaults are required");
  if (!Array.isArray(i.rows) || i.rows.length === 0) throw new Error("operation rows are required");
  const ids = new Set<string>(); for (const r of i.rows) { exact(r,["id","upstreamActionId","sourceRefs","documentationUrls","responseContract","adaptations","operation"],"operation row"); if (!text(r.id)||!text(r.upstreamActionId)||ids.has(r.id)) throw new Error("duplicate or invalid native operation ID"); ids.add(r.id); if (!Array.isArray(r.sourceRefs)||!r.sourceRefs.length||!r.sourceRefs.every(text)||!Array.isArray(r.documentationUrls)||!r.documentationUrls.length||!r.documentationUrls.every(text)||!Array.isArray(r.adaptations)||!r.adaptations.every(text)||!own(r.operation)) throw new Error(`incomplete operation row: ${r.id}`); }
  if (JSON.stringify(i.selection.operations) !== JSON.stringify(i.rows.map(r=>r.id))) throw new Error("selection operation allowlist must match rows");
  const cases = new Set<string>(), caseNames = new Set<string>(); for (const f of i.fixtures) { exact(f,["id","operation","input","credentials","evidence","exchanges","expected"],"fixture"); const folded = f.id.toLocaleLowerCase("en-US"); if (!text(f.id)||!safe(f.id)||cases.has(f.id)||caseNames.has(folded)||!ids.has(f.operation)) throw new Error("duplicate, case-colliding or unsafe fixture id or unknown fixture operation"); cases.add(f.id); caseNames.add(folded); if (!own(f.input)||!own(f.credentials)||!own(f.evidence)||!Array.isArray(f.exchanges)||!own(f.expected)) throw new Error(`incomplete fixture: ${f.id}`); if (f.expected.kind === "success" && (Object.keys(f.expected).some(k=>k!=="kind"&&k!=="result") || !Object.hasOwn(f.expected,"result"))) throw new Error(`success result required: ${f.id}`); if (f.expected.kind === "error" && (Object.keys(f.expected).some(k=>k!=="kind"&&k!=="code"&&k!=="retryAfterSeconds") || !text(f.expected.code) || (f.expected.retryAfterSeconds !== undefined && (!Number.isFinite(f.expected.retryAfterSeconds) || f.expected.retryAfterSeconds < 0)))) throw new Error(`error code required: ${f.id}`); if (f.expected.kind !== "success" && f.expected.kind !== "error") throw new Error(`invalid expected kind: ${f.id}`); if (Object.keys(f.credentials).some(k=>!text(f.credentials[k]))) throw new Error("fixture credentials must be nonempty strings"); }
  if (!i.fixtures.length) throw new Error("fixtures are required");
  if (!own(i.auth)||!own(i.auth.setup)||!own(i.network)||!own(i.http)||!Object.hasOwn(i.selection,"gates")) throw new Error("missing native policy blocks");
  for (const f of i.fixtures) for (const req of f.exchanges?.map(e=>e.request) ?? (f.request ? [f.request] : [])) if (!/^https:\/\//.test(req.url) || /(^|\/)(\.\.?)(\/|$)/.test(new URL(req.url).pathname) || /(^|\/)(\.\.?)(\/|$)/.test(req.url)) throw new Error("fixture URL must use HTTPS and a safe path");
}

export async function materializeAuthoring(input: AuthoringInput): Promise<{ recipeDir: string; recipe: ReviewedRecipe }> {
  validate(input);
  const root = await mkdtemp(join(tmpdir(), "appcall-authoring-"));
  const recipeDir = join(root, input.providerId); await mkdir(join(recipeDir,"fixtures/cases"),{recursive:true}); await mkdir(join(recipeDir,"fixtures/responses")); await mkdir(join(recipeDir,"fixtures/expected"));
  const operations = Object.fromEntries(input.rows.map(r=>[r.id,{timeoutMs:input.defaults.timeoutMs,maxInputBytes:input.defaults.maxInputBytes,maxResponseBytes:input.defaults.maxResponseBytes,...r.operation}]));
  const recipe = { schemaVersion:1, providerId:input.providerId, appcallId:input.appcallId, source:input.source, selection:input.selection, research:input.research, operationSources:Object.fromEntries(input.rows.map(r=>[r.id,{upstreamActionId:r.upstreamActionId,sourceRefs:r.sourceRefs,documentationUrls:r.documentationUrls,responseContract:r.responseContract,adaptations:r.adaptations}])), manifest:{key:input.appcallId,name:input.appcallId,version:"0.1.0",runtime:"bun",visibility:"public",categories:input.categories,auth:input.auth,network:input.network,models:input.models,http:input.http,operations,provenance:{source:{url:input.source.url,revision:input.source.revision}},evidence:{fixture:{status:"supplied"},live:{status:"unverified"}}} } as ReviewedRecipe;
  await writeFile(join(recipeDir,"recipe.json"),JSON.stringify(recipe,null,2)+"\n");
  for (const f of input.fixtures) { const expectedName=`${f.id}.json`; const exchanges=f.exchanges; for (let n=0;n<exchanges.length;n++) await writeFile(join(recipeDir,"fixtures/responses",`${f.id}-${n}.json`),JSON.stringify(exchanges[n].response.body,null,2)+"\n"); const errorExpected=f.expected.kind === "error"; if (!errorExpected) await writeFile(join(recipeDir,"fixtures/expected",expectedName),JSON.stringify(f.expected.result,null,2)+"\n"); const c={schemaVersion:1,id:f.id,operation:f.operation,input:f.input,credentials:f.credentials,evidence:f.evidence,exchanges:exchanges.map((e,n)=>({request:e.request,response:{status:e.response.status,headers:e.response.headers,bodyFile:`../responses/${f.id}-${n}.json`}})),expected:errorExpected ? f.expected : {kind:"success",resultFile:`../expected/${expectedName}`}}; await writeFile(join(recipeDir,"fixtures/cases",`${f.id}.json`),JSON.stringify(c,null,2)+"\n"); }
  await writeFile(join(recipeDir,"README.md"),`# ${input.appcallId}\n\nMaterialized from explicitly reviewed native operation rows.\n`);
  return {recipeDir, recipe: await readRecipe(recipeDir)};
}

export { validate as validateAuthoringInput };
export const materializeReviewedRows = materializeAuthoring;
