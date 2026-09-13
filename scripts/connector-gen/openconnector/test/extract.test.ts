import { expect, test } from "bun:test";
import { extractActions } from "../static-parser.ts";
const codaFixture =
  `const get_current_user = defineProviderAction(service, { name: "get_current_user", description: ` +
  "`Current user`" +
  `, requiredScopes: [], inputSchema: s.object("in", {}), outputSchema: s.object("out", {}) });
` +
  [
    "list_docs",
    "get_doc",
    "list_pages",
    "list_tables",
    "list_columns",
    "list_rows",
  ]
    .map(
      (id) =>
        `defineProviderAction(service,{name:"${id}",description:"${id}",requiredScopes:[],inputSchema:s.object("in",{}),outputSchema:s.object("out",{})});`,
    )
    .join("\n");
const helpFixture =
  `export const helpscoutConnectorScopes={inboxRead:"helpscout.inbox.read"}; const readScope=helpscoutConnectorScopes.inboxRead;` +
  [
    "list_users",
    "list_inboxes",
    "list_tags",
    "list_conversations",
    "get_conversation",
    "list_threads",
  ]
    .map(
      (id) =>
        `defineProviderAction(service,{name:"${id}",description:"${id}",requiredScopes:[readScope],inputSchema:s.object("in",{}),outputSchema:s.object("out",{})});`,
    )
    .join("\n");
test("extracts exact pinned Coda selection and preserves expressions", () => {
  const s = codaFixture;
  const ids = [
    "get_current_user",
    "list_docs",
    "get_doc",
    "list_pages",
    "list_tables",
    "list_columns",
    "list_rows",
  ];
  const r = extractActions(s, "coda/actions.ts", "coda", ids);
  expect(r.actions.map((x) => x.id)).toEqual(ids);
  expect(r.holds).toEqual([]);
  expect(r.actions[0]!.schemaSource?.requiresReviewedAdapter).toBe(true);
});
test("extracts exact pinned Help Scout selection and declared scopes", () => {
  const s = helpFixture;
  const ids = [
    "list_users",
    "list_inboxes",
    "list_tags",
    "list_conversations",
    "get_conversation",
    "list_threads",
  ];
  const r = extractActions(s, "helpscout/actions.ts", "helpscout", ids);
  expect(r.actions.map((x) => x.id)).toEqual(ids);
  expect(r.holds).toEqual([]);
  expect(r.actions.find((x) => x.id === "list_users")!.requiredScopes).toEqual([
    "helpscout.inbox.read",
  ]);
});
test("holds unknown requested action", () => {
  const r = extractActions(
    'defineProviderAction(service,{name:"ok",description:"x",requiredScopes:[],inputSchema: x,outputSchema:y})',
    "x",
    "p",
    ["missing"],
  );
  expect(r.holds[0]?.code).toBe("UNKNOWN_ACTION");
});
test("rejects dynamic names and duplicates without evaluation", () => {
  const s =
    'const nope=(()=>{throw new Error("boom")})(); defineProviderAction(s,{name:nope,description:"x",requiredScopes:[],inputSchema:x,outputSchema:y}); defineProviderAction(s,{name:"ok",description:"nested ] } //",requiredScopes:[],inputSchema:{a:[1,{b:"]"}]},outputSchema:{}}); defineProviderAction(s,{name:"ok",description:"dup",requiredScopes:[],inputSchema:{},outputSchema:{}})';
  const r = extractActions(s, "x", "p");
  expect(r.actions.map((x) => x.id)).toEqual(["ok"]);
  expect(r.holds.some((x) => x.code === "DUPLICATE_ACTION")).toBe(true);
});
test("ignores fake calls in imports comments and strings",()=>{const s=`import { defineProviderAction } from "x"; const text="defineProviderAction({name:'fake'})"; // defineProviderAction({name:"fake2"})
defineProviderAction(service,{name:"real",description:"url // safe",requiredScopes:[],inputSchema:s.object("in",{}),outputSchema:s.object("out",{})}); trailing { braces }`;const r=extractActions(s,"x","p");expect(r.actions.map(x=>x.id)).toEqual(["real"])});
test("extracts literal source array map",()=>{const r=extractActions('const sources=[{name:"list_saved_cohorts"},{name:"get_cohort"}]; sources.map(action=>defineProviderAction(service,{name:action.name}))',"x","mixpanel");expect(r.actions.map(x=>x.id)).toEqual(["list_saved_cohorts","get_cohort"])});
test("rejects dynamic source array maps",()=>{const r=extractActions('const sources=[{name:getName()}]; sources.map(action=>defineProviderAction(service,{name:action.name}))',"x","mixpanel");expect(r.actions).toHaveLength(0)});
test("holds pinned New Relic actions for reviewed fallback", async()=>{const root=process.env.APPCALL_OPENCONNECTOR_SOURCE;if(!root)return;const s=await Bun.file(`${root}/src/providers/new_relic/actions.ts`).text();const r=extractActions(s,"new_relic/actions.ts","new_relic",["get_alert_policies"]);expect(r.actions).toEqual([]);expect(r.holds.length).toBeGreaterThan(0)});
test("extracts pinned Mixpanel map actions without dynamic-name holds", async()=>{const root=process.env.APPCALL_OPENCONNECTOR_SOURCE;if(!root)return;const s=await Bun.file(`${root}/src/providers/mixpanel/actions.ts`).text();const r=extractActions(s,"mixpanel/actions.ts","mixpanel",["list_saved_cohorts","list_funnels","query_profiles"]);expect(r.actions.map(x=>x.id)).toEqual(["list_saved_cohorts","list_funnels","query_profiles"]);expect(r.holds).toEqual([])});
test("holds altered, shadowed, dynamic, and comment-only wrappers",()=>{const base='function action(name, description) { return defineProviderAction(service, { name, description }); } export const xActions: ActionDefinition[] = [action("ok", "x")];';for(const s of [base.replace("return defineProviderAction", "return fakeDefineProviderAction"),base.replace("function action(name", "function action(other"),base.replace('action("ok", "x")','action(getName(), "x")'), '/* function action(name, description) { return defineProviderAction(service, { name, description }); } */ export const xActions: ActionDefinition[] = [fake("ok")];']) { const r=extractActions(s,"x","p",["ok"]); expect(r.holds.some(h=>h.code==="DYNAMIC_WRAPPER"||h.code==="UNKNOWN_ACTION") || !r.actions.some(a=>a.id==="ok")).toBe(true); }});
