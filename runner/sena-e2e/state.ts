// runner/sena-e2e/state.ts
// Sena-owned lead state (leads.csv) + append-only evidence log (evidence.jsonl).
// appcall never sees these files; they are the harness's working memory.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// compose runs inline in the send stage (composeFor); there is no separate composed stage.
export type Stage = "sourced" | "enriched" | "booking_ready" | "sent";

export interface Lead {
  lead_id: string;
  full_name: string;
  title: string;
  company: string;
  linkedin_url: string;
  email: string;
  apollo_id: string;
  stage: Stage | string;
  channel: string;
  booking_url: string;
  last_request_id: string;
}

const COLUMNS: (keyof Lead)[] = [
  "lead_id", "full_name", "title", "company", "linkedin_url", "email",
  "apollo_id", "stage", "channel", "booking_url", "last_request_id",
];

function escape(v: string): string {
  const flat = v.replace(/[\r\n]+/g, " ");
  if (flat.includes(",") || flat.includes('"')) {
    return `"${flat.replace(/"/g, '""')}"`;
  }
  return flat;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ",") { out.push(cur); cur = ""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

export function serializeLeads(leads: Lead[]): string {
  const header = COLUMNS.join(",");
  const rows = leads.map((l) => COLUMNS.map((c) => escape(String(l[c] ?? ""))).join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function parseLeads(csv: string): Lead[] {
  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const lead: Record<string, string> = {};
    COLUMNS.forEach((c, i) => { lead[c] = cells[i] ?? ""; });
    return lead as unknown as Lead;
  });
}

export interface EvidenceRow {
  ts: string;
  stage: string;
  tool: string;
  request_id: string;
  status: string;
  mode: string;
}

export class Store {
  private leadsPath: string;
  private evidencePath: string;
  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.leadsPath = join(stateDir, "leads.csv");
    this.evidencePath = join(stateDir, "evidence.jsonl");
  }
  readLeads(): Lead[] {
    if (!existsSync(this.leadsPath)) return [];
    return parseLeads(readFileSync(this.leadsPath, "utf8"));
  }
  writeLeads(leads: Lead[]): void {
    writeFileSync(this.leadsPath, serializeLeads(leads));
  }
  appendEvidence(row: EvidenceRow): void {
    appendFileSync(this.evidencePath, JSON.stringify(row) + "\n");
  }
  readEvidence(): EvidenceRow[] {
    if (!existsSync(this.evidencePath)) return [];
    return readFileSync(this.evidencePath, "utf8")
      .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as EvidenceRow);
  }
  // Green = a prior run logged a successful live_single send AND a booking link.
  priorEvidenceGreen(): boolean {
    const rows = this.readEvidence();
    const sentLive = rows.some((r) => r.stage === "send" && r.status === "ok" && r.mode === "live_single");
    const booked = rows.some((r) => r.stage === "booking" && r.status === "ok");
    return sentLive && booked;
  }
}
