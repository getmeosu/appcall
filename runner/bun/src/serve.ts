import { timingSafeEqual } from "node:crypto";
import { handleRPC } from "./server";

export interface RunnerFetchOptions {
  // token, when set, is required as "Authorization: Bearer <token>" on every
  // /rpc call (fail-closed). Unset keeps the runner open for local dev.
  token?: string;
  maxConcurrent?: number;
  maxQueued?: number;
  maxJobs?: number;
  onRecycle?: () => void;
}

// createFetchHandler builds the HTTP entrypoint: GET /healthz is always open
// (liveness probes must work before/without auth), POST /rpc is gated by the
// shared token when configured, everything else is the 404 envelope.
export function createFetchHandler(
  options: RunnerFetchOptions = {},
): (request: Request) => Promise<Response> | Response {
  const token = options.token?.trim() || undefined;
  const maxConcurrent=options.maxConcurrent??32;
  const maxQueued=options.maxQueued??128;
  if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||!Number.isSafeInteger(maxQueued)||maxQueued<0) throw new Error("Invalid runner admission limits");
  let active=0, completed=0, draining=false;
  const queue:Array<()=>void>=[];
  const unavailable=(request: Request)=>Response.json({...(safeRequestID(request) ? {id:safeRequestID(request)} : {}),ok:false,error:{code:"RUNNER_BUSY",message:"Runner admission limit reached."}},{status:503});
  const dispatch=async(request:Request):Promise<Response>=>{
    const admittedAt = Date.now();
    if(draining || (active>=maxConcurrent && queue.length>=maxQueued))return unavailable(request);
    if(active>=maxConcurrent) await new Promise<void>(resolve=>queue.push(resolve));
    else active++;
    try { return await handleRPC(request, admittedAt); }
    finally {
      completed++;
      if(options.maxJobs && completed>=options.maxJobs)draining=true;
      const next=queue.shift();
      if(next)next(); else active--;
      if(draining && active===0)options.onRecycle?.();
    }
  };
  return (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true, runner: "appcall-bun" });
    }
    if (request.method === "POST" && url.pathname === "/rpc") {
      if (token && !bearerTokenMatches(request.headers.get("authorization"), token)) {
        return Response.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "Runner token required." } },
          { status: 401 },
        );
      }
      return dispatch(request);
    }

    return Response.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Route not found." } },
      { status: 404 },
    );
  };
}

function safeRequestID(request: Request): string | undefined {
  const value = request.headers.get("x-request-id");
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value) ? value : undefined;
}

// bearerTokenMatches compares the presented bearer token in constant time.
// The length check is required because timingSafeEqual throws on unequal
// lengths; leaking the token's length is acceptable, its bytes are not.
function bearerTokenMatches(header: string | null, expected: string): boolean {
  if (!header) {
    return false;
  }
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") {
    return false;
  }
  const presented = Buffer.from(rest.join(" ").trim());
  const want = Buffer.from(expected);
  if (presented.length !== want.length) {
    return false;
  }
  return timingSafeEqual(presented, want);
}
