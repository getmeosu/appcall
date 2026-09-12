import { runExecution } from "./execution";
import {
  type RequestEnvelope,
  type ResponseEnvelope,
  supportedProtocolVersion,
} from "./protocol";
import { logLine, redactText } from "./redact";
import { defaultConnectorRegistry } from "./registry";
import { jsonByteLength, maxOperationTimeoutMs, operationWireResponseLimit, rpcRequestLimitBytes } from "./budget";

export async function handleRPC(request: Request, admittedAt = Date.now()): Promise<Response> {
  const started = Math.min(admittedAt, Date.now());
  let envelope: RequestEnvelope;
  try {
    const reader = request.body?.getReader();
    const readSignal=AbortSignal.any([request.signal,AbortSignal.timeout(Math.max(0, started + maxOperationTimeoutMs - Date.now()))]);
    const cancelRead=()=>{
      if (!reader) return;
      try {
        void reader.cancel(readSignal.reason).catch(() => {});
      } catch {
        // A custom stream may throw while being canceled; the request is still
        // already aborted and must retain the timeout response below.
      }
    };
    // Adding an abort listener does not replay an abort that happened before
    // registration. Cancel the stream explicitly before the first read so an
    // already-aborted request cannot leave a custom ReadableStream pending.
    if (readSignal.aborted) {
      cancelRead();
      return jsonResponse(504, undefined, {ok:false,error:{code:"OPERATION_TIMEOUT",message:"RPC request aborted."}});
    }
    readSignal.addEventListener("abort",cancelRead,{once:true});
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      if(reader) while(true) {
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>rpcRequestLimitBytes){await reader.cancel();return jsonResponse(413,undefined,{ok:false,error:{code:"INPUT_TOO_LARGE",message:"RPC body exceeds byte limit."}});}
        chunks.push(value);
      }
    } catch (error) {
      if (readSignal.aborted) {
        return jsonResponse(504, undefined, {ok:false,error:{code:"OPERATION_TIMEOUT",message:"RPC request aborted."}});
      }
      throw error;
    } finally {readSignal.removeEventListener("abort",cancelRead);}
    if(readSignal.aborted)return jsonResponse(504,undefined,{ok:false,error:{code:"OPERATION_TIMEOUT",message:"RPC request aborted."}});
    envelope = JSON.parse(Buffer.concat(chunks).toString());
    if (!isRecord(envelope) || (envelope.id !== undefined && (typeof envelope.id !== "string" || !envelope.id || envelope.id.length > 256)) || (envelope.params !== undefined && !isRecord(envelope.params)) || (envelope.deadlineUnixMs !== undefined && (!Number.isSafeInteger(envelope.deadlineUnixMs) || envelope.deadlineUnixMs < 0))) throw new Error("Invalid envelope");
  } catch {
    return jsonResponse(400, undefined, {
      ok: false,
      error: { code: "MALFORMED_REQUEST", message: "Request body must be valid JSON." },
    });
  }

  const requestID = envelope.id ?? request.headers.get("x-request-id") ?? "runner-local";
  logRequest(requestID, envelope.method ?? "missing.method");

  try { return await runExecution(() => dispatchRPC(envelope), maxOperationTimeoutMs, request.signal, Math.min(envelope.deadlineUnixMs??Infinity,started+maxOperationTimeoutMs), credentialValues(envelope)); } catch(error) { const failure=errorResponseForExecutionFailure(error,"CONNECTOR_UPSTREAM_ERROR","Runner failed."); return jsonResponse(failure.status,envelope.id,{ok:false,error:failure.error}); }
}

async function dispatchRPC(envelope: RequestEnvelope): Promise<Response> {
  switch (envelope.method as string | undefined) {
    case "runner.describe":
      return jsonResponse(200, envelope.id, {
        ok: true,
        result: {
          protocolVersion: supportedProtocolVersion,
          runner: "appcall-bun",
          durableCapabilities: ["absolute-deadline", "bounded-rpc", "cancellation"],
        },
      });
    case "connector.describe":
      return handleConnectorDescribe(envelope);
    case "connector.healthcheck":
      return handleConnectorHealthcheck(envelope);
    case "connector.action.execute":
      return handleConnectorActionExecute(envelope);
    case "connector.sync.list":
      return handleConnectorSyncList(envelope);
    case "connector.webhook.verify":
      return handleConnectorWebhookVerify(envelope);
    case "connector.webhook.parse":
      return handleConnectorWebhookParse(envelope);
    default:
      return jsonResponse(400, envelope.id, {
        ok: false,
        error: { code: "UNKNOWN_METHOD", message: "Unknown runner method." },
      });
  }
}

async function handleConnectorSyncList(envelope: RequestEnvelope): Promise<Response> {
  const connectorKey = readConnectorKey(envelope);
  if (!connectorKey || !defaultConnectorRegistry.describe(connectorKey)) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." },
    });
  }
  const sync = readStringParam(envelope, "sync");
  if (!sync) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "SYNC_NOT_DECLARED", message: "Sync is not declared in the connector manifest." },
    });
  }
  let syncResult;
  try {
    syncResult = defaultConnectorRegistry.executeSync(connectorKey, sync, envelope.params?.input ?? {});
  } catch (error) {
    const executionError = errorResponseForExecutionFailure(error, "INVALID_SYNC_INPUT", "Sync input is invalid.");
    return jsonResponse(executionError.status, envelope.id, {
      ok: false,
      error: executionError.error,
    });
  }
  if (!syncResult.ok) {
    return jsonResponse(statusForRegistryFailure(syncResult.code), envelope.id, {
      ok: false,
      error: { code: syncResult.code, message: syncResult.message },
    });
  }

  let output;
  try {
    output = await Promise.resolve(syncResult.output);
  } catch (error) {
    // Preserve the structured code the connector threw. Mapping every rejection
    // to 400 INVALID_SYNC_INPUT told the caller its request was malformed when
    // the real cause was a provider outage or a rate limit — and 400 tells a
    // client not to retry something that is entirely retryable. The action path
    // was already fixed for this; the sync path had been left behind.
    const executionError = errorResponseForExecutionFailure(error, "INVALID_SYNC_INPUT", "Sync input is invalid.");
    console.error(logLine({
      component: "runner",
      event: "sync_rejected",
      requestID: envelope.id,
      connector: connectorKey,
      sync,
      error: executionError.error,
    }));
    return jsonResponse(executionError.status, envelope.id, {
      ok: false,
      error: executionError.error,
    });
  }

  const operationOutput = {
    ...(isRecord(output) ? output : {}),
    connector: connectorKey,
    sync,
  };
  const maxResponseBytes = defaultConnectorRegistry.operationBudget(connectorKey, sync)?.maxResponseBytes;
  if (typeof maxResponseBytes !== "number" || jsonByteLength(operationOutput) > maxResponseBytes) {
    return jsonResponse(502, envelope.id, {
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE", message: "Operation output exceeds the manifest byte limit." },
    });
  }
  return jsonResponse(200, envelope.id, {
    ok: true,
    result: {
      output: operationOutput,
    },
  }, maxResponseBytes);
}

async function handleConnectorActionExecute(envelope: RequestEnvelope): Promise<Response> {
  const connectorKey = readConnectorKey(envelope);
  if (!connectorKey || !defaultConnectorRegistry.describe(connectorKey)) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." },
    });
  }
  const action = readStringParam(envelope, "action");
  if (!action) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "ACTION_NOT_DECLARED", message: "Action is not declared in the connector manifest." },
    });
  }
  let actionResult;
  try {
    actionResult = defaultConnectorRegistry.executeAction(connectorKey, action, envelope.params?.input ?? {});
  } catch (error) {
    const executionError = errorResponseForExecutionFailure(error, "INVALID_ACTION_INPUT", "Action input is invalid.");
    return jsonResponse(executionError.status, envelope.id, {
      ok: false,
      error: executionError.error,
    });
  }
  if (!actionResult.ok) {
    // Log action failures — the upstream HTTP status + provider reason are
    // otherwise swallowed (the Go gateway maps them to a generic code), which
    // made e.g. Apollo's "endpoint deprecated (422)" invisible during triage.
    console.error(logLine({ component: "runner", event: "action_failed", requestID: envelope.id, connector: connectorKey, action, code: actionResult.code, message: actionResult.message }));
    return jsonResponse(statusForRegistryFailure(actionResult.code), envelope.id, {
      ok: false,
      error: { code: actionResult.code, message: actionResult.message },
    });
  }

  let output;
  try {
    output = await Promise.resolve(actionResult.output);
  } catch (error) {
    // An async handler rejected. Preserve its structured error code (upstream
    // failure, rate limit, timeout) instead of mislabeling everything as
    // invalid input.
    const executionError = errorResponseForExecutionFailure(error, "INVALID_ACTION_INPUT", "Action input is invalid.");
    // Log the real upstream error so connector failures are diagnosable instead
    // of surfacing only as the gateway's generic "Tool execution failed."
    console.error(logLine({ component: "runner", event: "action_rejected", requestID: envelope.id, connector: connectorKey, action, error: executionError.error, raw: error }));
    return jsonResponse(executionError.status, envelope.id, {
      ok: false,
      error: executionError.error,
    });
  }

  const operationOutput = {
    ...(isRecord(output) ? output : {}),
    connector: connectorKey,
    action,
  };
  const maxResponseBytes = defaultConnectorRegistry.operationBudget(connectorKey, action)?.maxResponseBytes;
  if (typeof maxResponseBytes !== "number" || jsonByteLength(operationOutput) > maxResponseBytes) {
    return jsonResponse(502, envelope.id, {
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE", message: "Operation output exceeds the manifest byte limit." },
    });
  }
  return jsonResponse(200, envelope.id, {
    ok: true,
    result: {
      output: operationOutput,
    },
  }, maxResponseBytes);
}

// handleConnectorWebhookVerify proves an inbound webhook delivery is authentic.
// The control plane only trusts a positive { verified: true } result; a thrown
// signature failure is surfaced as WEBHOOK_SIGNATURE_INVALID so Go can
// distinguish a forged request from an infrastructure problem.
function handleConnectorWebhookVerify(envelope: RequestEnvelope): Response {
  const connectorKey = readConnectorKey(envelope);
  if (!connectorKey) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." },
    });
  }
  const payload = envelope.params?.payload ?? {};
  const headers = isRecord(envelope.params?.headers) ? (envelope.params!.headers as Record<string, string>) : {};
  const result = defaultConnectorRegistry.verifyWebhook(connectorKey, payload, headers);
  if (!result.ok) {
    return jsonResponse(statusForWebhookFailure(result.code), envelope.id, {
      ok: false,
      error: { code: result.code, message: result.message },
    });
  }
  const verified = isRecord(result.output) && result.output.verified === true;
  if (!verified) {
    return jsonResponse(400, envelope.id, {
      ok: false,
      error: { code: "WEBHOOK_SIGNATURE_INVALID", message: "Webhook signature could not be verified." },
    });
  }
  return jsonResponse(200, envelope.id, { ok: true, result: { verified: true } });
}

// handleConnectorWebhookParse returns the connector-owned idempotency key,
// optional sync operation, and a sanitized payload safe for persistence.
function handleConnectorWebhookParse(envelope: RequestEnvelope): Response {
  const connectorKey = readConnectorKey(envelope);
  if (!connectorKey) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." },
    });
  }
  const payload = envelope.params?.payload ?? {};
  const result = defaultConnectorRegistry.parseWebhook(connectorKey, payload);
  if (!result.ok) {
    return jsonResponse(statusForWebhookFailure(result.code), envelope.id, {
      ok: false,
      error: { code: result.code, message: result.message },
    });
  }
  const parsed = isRecord(result.output) ? result.output : {};
  return jsonResponse(200, envelope.id, {
    ok: true,
    result: {
      idempotencyKey: typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : "",
      operation: typeof parsed.operation === "string" ? parsed.operation : "",
      sanitized: parsed.sanitized ?? {},
    },
  });
}

function statusForWebhookFailure(code: string): number {
  return code === "UNKNOWN_CONNECTOR" ? 404 : 400;
}

function handleConnectorDescribe(envelope: RequestEnvelope): Response {
  const connectorKey = readConnectorKey(envelope);
  const connector = connectorKey ? defaultConnectorRegistry.describe(connectorKey) : undefined;
  if (!connector) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." },
    });
  }

  return jsonResponse(200, envelope.id, {
    ok: true,
    result: connector,
  });
}

// handleConnectorHealthcheck now invokes the connector's healthcheck handler
// with the connection's credential input (the new `params.input` contract from
// the Go side). The handler may make a REAL authenticated provider call, return
// a Promise, and throw a structured { ok:false, code, message } on an upstream
// failure — all preserved via errorResponseForExecutionFailure, exactly like the
// action path. A no-credential input keeps the static setup-validation result.
async function handleConnectorHealthcheck(envelope: RequestEnvelope): Promise<Response> {
  const connectorKey = readConnectorKey(envelope);
  const healthcheckResult = connectorKey
    ? defaultConnectorRegistry.healthcheck(connectorKey, envelope.params?.input ?? {})
    : undefined;
  if (!healthcheckResult) {
    return jsonResponse(404, envelope.id, {
      ok: false,
      error: { code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." },
    });
  }
  if (!healthcheckResult.ok) {
    return jsonResponse(statusForExecutionErrorCode(healthcheckResult.code), envelope.id, {
      ok: false,
      error: { code: healthcheckResult.code, message: healthcheckResult.message, retryAfterSeconds: healthcheckResult.retryAfterSeconds },
    });
  }

  let result;
  try {
    result = await Promise.resolve(healthcheckResult.output);
  } catch (error) {
    const executionError = errorResponseForExecutionFailure(error, "CONNECTOR_UPSTREAM_ERROR", "Connector healthcheck failed.");
    return jsonResponse(executionError.status, envelope.id, {
      ok: false,
      error: executionError.error,
    });
  }

  return jsonResponse(200, envelope.id, {
    ok: true,
    result,
  });
}

function readConnectorKey(envelope: RequestEnvelope): string | undefined {
  return readStringParam(envelope, "connectorKey");
}

function readStringParam(envelope: RequestEnvelope, key: string): string | undefined {
  if (!envelope.params) {
    return undefined;
  }
  const value = envelope.params[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(status: number, requestID: string | undefined, payload: ResponseEnvelope, operationResponseBytes?: number): Response {
  const safePayload=payload.error ? {...payload,error:{...payload.error,message:redactText(payload.error.message)}}:payload;
  const body=JSON.stringify(requestID ? { id: requestID, ...safePayload } : safePayload);
  if(Buffer.byteLength(body)>operationWireResponseLimit(operationResponseBytes)) return Response.json({id:requestID,ok:false,error:{code:"OUTPUT_TOO_LARGE",message:"RPC output exceeds byte limit."}},{status:502});
  return new Response(body,{status,headers:{"content-type":"application/json"}});
}

function statusForRegistryFailure(code: string): number {
  if (code === "INPUT_TOO_LARGE") {
    return 413;
  }
  if (code === "UNSUPPORTED_OPERATION_BUDGET") {
    return 400;
  }
  return 404;
}

// statusForExecutionErrorCode maps a connector handler's structured error code
// to an HTTP status. Unknown codes default to 400.
export function statusForExecutionErrorCode(code: string): number {
  switch (code) {
    case "OPERATION_TIMEOUT":
    case "OUTBOUND_TIMEOUT":
      return 504;
    case "CONNECTOR_RATE_LIMITED":
      return 429;
    case "CONNECTOR_UNAVAILABLE":
      return 503;
    case "CONNECTOR_UPSTREAM_ERROR":
    case "CONNECTOR_RESPONSE_INVALID":
    case "OUTPUT_TOO_LARGE":
    case "OUTBOUND_RESPONSE_TOO_LARGE":
      return 502;
    case "OUTBOUND_UNSUPPORTED_BUDGET":
    case "UNSUPPORTED_OPERATION_BUDGET":
      return 400;
    case "CONNECTOR_ACCOUNT_RESTRICTED":
      // 423 Locked: the upstream account is flagged/checkpointed. The control
      // plane quarantines the connection on this signal.
      return 423;
    case "CONNECTOR_ACTION_NOT_PERMITTED":
      // 422 Unprocessable: the provider refused this specific action (e.g. invite
      // cooldown). Not a whole-connection failure.
      return 422;
    default:
      return 400;
  }
}

// errorResponseForExecutionFailure preserves a connector handler's own structured
// error (the { ok:false, code, message } objects handlers throw on upstream
// failures, rate limits, timeouts) so the control plane and the test UI see the
// real cause. Only unstructured throws fall back to the supplied code/message.
export function errorResponseForExecutionFailure(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): { status: number; error: { code: string; message: string; retryAfterSeconds?: number } } {
  if (isRecord(error) && typeof error.code === "string" && error.code.length > 0) {
    return {
      status: statusForExecutionErrorCode(error.code),
      error: {
        code: error.code,
        ...(typeof error.retryAfterSeconds === "number" && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0 ? {retryAfterSeconds:error.retryAfterSeconds}:{}),
        message: typeof error.message === "string" ? redactText(error.message) : fallbackMessage,
      },
    };
  }
  return {
    status: 400,
    error: {
      code: fallbackCode,
      message: error instanceof Error ? redactText(error.message) : fallbackMessage,
    },
  };
}

function logRequest(requestID: string, method: string): void {
  console.info(logLine({ component: "runner", requestID, method }));
}

function credentialValues(envelope:RequestEnvelope):string[]{
 const input=envelope.params?.input;
 if(!isRecord(input))return [];
 const manifest=defaultConnectorRegistry.describe(readConnectorKey(envelope)??"") as any;
 const setup=manifest?.auth?.setup;
 const keys=new Set<string>(Object.keys(input).filter(k=>/token|secret|password|apikey|authorization|credential|basicauth/i.test(k.replace(/[^a-z]/gi,""))));
 for(const f of [...(setup?.fields??[]),...(setup?.routes??[]).flatMap((r:any)=>r.fields??[])])if(f.secret)keys.add(f.key);
 for(const d of setup?.derive??[])keys.add(d.field);
 if(manifest?.http?.auth?.field)keys.add(manifest.http.auth.field);
 return [...keys].map(k=>input[k]).filter((v):v is string=>typeof v==='string'&&v.length>0);
}
