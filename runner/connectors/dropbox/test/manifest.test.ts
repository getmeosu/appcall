import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";

const LEGACY = new Set(["healthcheck","root.list","folders.list","folders.continue","files.getMetadata","folders.create","files.move","files.delete","files.copy","files.search","files.getTemporaryLink","files.saveUrl","files.listRevisions","files.restore","sharing.createSharedLink","sharing.listSharedLinks","sharing.getSharedLinkMetadata","sharing.revokeSharedLink","users.getSpaceUsage","users.getAccount","sharing.listFolders","sharing.shareFolder"]);
const WRITE_TOKENS = new Set(["add","create","delete","remove","update","modify","set","move","copy","restore","revoke","share","unshare","mount","unmount","lock","unlock","transfer","invite","suspend","unsuspend","recover","send","archive","rename","save","upload","overwrite","activate","deactivate","relinquish","release","hide","unhide","disable","enable","kick","claim","reset","change","replace","append","purge","erase","destroy","detach","attach","rotate","promote","demote","assign","unassign","merge","clone","trash","wipe","cancel","decline","accept","join","leave","grant","deny","reject","approve","publish","subscribe","unsubscribe","unlink","install","uninstall","provision","terminate","pause","resume","mute","pin","generate","confirm","abort","insert","expire","invalidate","regenerate","welcome"]);
const READ_LAST = new Set(["get","list","search","continue","check","count","userinfo","echo","user","metadata","revisions","usage","info","status","values","events","policies","features","history","log"]);
function tokensOf(segment: string) {
  return segment.split("_").filter((token) => !/^v\d+$/.test(token) && token !== "job");
}
function classifiedSideEffect(key: string) {
  const segments = key.split(".");
  const last = tokensOf(segments[segments.length - 1] ?? "");
  const all = segments.flatMap(tokensOf);
  if (all.includes("async") && !all.includes("check")) return "write";
  if (/(^|\.)(add|remove|update)_for_user$/.test(key)) return "write";
  if (last.some((token) => token === "check" || token === "continue" || READ_LAST.has(token))) return "read";
  if (all.some((token) => WRITE_TOKENS.has(token))) return "write";
  return "read";
}

it("declares OAuth2 with manually collected credentials and bounded action schemas",()=>{
  expect(manifest.auth?.type).toBe("oauth2");
  expect(manifest.auth?.setup.mode).toBe("api_key");
  expect(manifest.auth?.setup.fields).toContainEqual(expect.objectContaining({key:"accessToken",secret:true,required:true}));
  expect(manifest.http?.auth.field).toBe("accessToken");
  expect(Object.keys(manifest.operations).sort()).toEqual(cases.map(c=>c.op).sort());
  for(const [key,op] of Object.entries(manifest.operations) as [string,any][]) {
    expect(op.inputSchema.type).toBe("object");expect(op.outputSchema.type).toBe("object");
    expect(op.kind).toBe("action");expect(op.timeoutMs).toBeGreaterThan(0);
    const responseHost = typeof op.request?.baseUrl === "string" ? new URL(op.request.baseUrl).hostname : new URL(manifest.http.baseUrl).hostname;
    expect(op.maxResponseBytes).toBeLessThanOrEqual(responseHost === "content.dropboxapi.com" && op.responseFormat === "text" ? 52428800 : 5242880);
    expect(op.sideEffect).toBe(LEGACY.has(key) ? (/create|move|delete|copy|restore|saveUrl|createSharedLink|revoke|shareFolder/.test(key)?"write":"read") : classifiedSideEffect(key));
    if (!LEGACY.has(key)) {
      expect(op.validationMode).toBe("strict-generated");
      expect(op.enforceOutputSchema).toBe(true);
      expect(op.responseFormat).toBe(responseHost === "content.dropboxapi.com" && op.sideEffect === "read" ? "text" : "json");
      expect(op.outputSchema.additionalProperties).toBe(false);
      expect(op.outputSchema.required).toEqual(["data"]);
    }
  }
  expect(manifest.network?.allowedHosts).toEqual(["api.dropboxapi.com", "content.dropboxapi.com", "www.dropbox.com"]);
  expect(manifest.network?.allowedHosts).toContain(new URL(manifest.http.baseUrl).hostname);
});

it("requires the fields guaranteed by each mapped response", () => {
  for (const op of Object.values(manifest.operations)) {
    const schema = op.outputSchema as {properties:Record<string,unknown>;required?:string[]};
    expect(schema.required?.sort()).toEqual(Object.keys(schema.properties).filter(key=>key!=="nextMarker").sort());
  }
  const identity = manifest.operations.healthcheck.outputSchema.properties.account as {required?:string[];properties?:Record<string,unknown>};
  expect(identity.required).toContain("account_id");
  expect(identity.properties?.account_id).toMatchObject({type:"string",minLength:1});
});
