import rows from "./reviewed-action-ids.json" with { type: "json" };
export type ReviewedActionIds = { providerId:string; commit:string; path:string; sha256:string; actionIds:string[] };
export const reviewedActionIds = rows as ReviewedActionIds[];
export function reviewedIds(providerId:string,commit:string,path:string,sha256:string): readonly string[]|undefined { const r=reviewedActionIds.find(x=>x.providerId===providerId&&x.commit===commit&&x.path===path&&x.sha256===sha256); return r?.actionIds; }
