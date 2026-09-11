import {test, expect} from 'bun:test';
import {handleRPC} from '../src/server';
import {createConnectorHttpClient} from '../src/http';
import {executionContext} from '../src/execution';
import {defaultConnectorRegistry} from '../src/registry';
import {createFetchHandler} from '../src/serve';
import {createCalDAVClient} from '../../connectors/caldav/src/http';
test('RPC rejects null envelopes without throwing', async()=> {
 const r=await handleRPC(new Request('http://local/rpc',{method:'POST',body:'null'})); expect(r.status).toBe(400);
});
test('pre-aborted outbound signal never dispatches',async()=>{
 let calls=0; const c=createConnectorHttpClient({allowedHosts:['example.com'],maxResponseBytes:100,fetch:(async()=>{calls++;return new Response('');}) as typeof fetch});
 await expect(c.fetchText('https://example.com',{signal:AbortSignal.abort()})).rejects.toBeDefined(); expect(calls).toBe(0);
});
test('RPC honors expired caller deadline',async()=>{
 const r=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'expired',method:'runner.describe',deadlineUnixMs:1})})); expect(r.status).toBe(504);
});

test('RPC permits a simulated action deadline beyond the legacy 60 second cap',async()=>{
 const original=defaultConnectorRegistry.executeAction; let observedDeadline=0;
 defaultConnectorRegistry.executeAction=()=>{observedDeadline=executionContext()?.deadlineUnixMs??0;return {ok:true,output:{ok:true}}};
 const admittedAt=Date.now(); const deadline=admittedAt+61_000;
 try{
  const request=new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'long-action',deadlineUnixMs:deadline,method:'connector.action.execute',params:{connectorKey:'apify',action:'actor.run_sync_get_dataset_items'}})});
  const response=await handleRPC(request,admittedAt);
  expect(response.status).toBe(200); expect(observedDeadline).toBeGreaterThanOrEqual(deadline-250);
 }finally{defaultConnectorRegistry.executeAction=original;}
});
test('CalDAV rejects unsafe credential destinations at construction',()=>{
 for(const baseUrl of ['http://caldav.icloud.com','https://caldav.icloud.com:8443','https://user:pass@caldav.icloud.com'])expect(()=>createCalDAVClient({username:'u',password:'p',baseUrl})).toThrow();
});
test('RPC preserves provider retry hints and caller cancellation at dispatch boundary',async()=>{
 const original=defaultConnectorRegistry.executeAction;
 defaultConnectorRegistry.executeAction=()=>({ok:true,output:Promise.reject({code:'CONNECTOR_RATE_LIMITED',message:'slow',retryAfterSeconds:17})});
 const request=(signal?:AbortSignal)=>new Request('http://local/rpc',{method:'POST',signal,body:JSON.stringify({id:'rpc-test',method:'connector.action.execute',params:{connectorKey:'resend',action:'emails.send'}})});
 try{
 const response=await handleRPC(request());
 expect(response.status).toBe(429);
 expect(await response.json()).toMatchObject({ok:false,error:{code:'CONNECTOR_RATE_LIMITED',retryAfterSeconds:17}});
 let dispatched=false;defaultConnectorRegistry.executeAction=()=>{dispatched=true;return {ok:true,output:{}}};
 expect((await handleRPC(request(AbortSignal.abort()))).status).toBe(504);expect(dispatched).toBe(false);
 }finally{defaultConnectorRegistry.executeAction=original;}
});
test('RPC keeps definitive upstream failures non-retryable without a retry hint',async()=>{
 const original=defaultConnectorRegistry.executeAction;
 try{
  for(const status of [400,401]){
   defaultConnectorRegistry.executeAction=()=>({ok:true,output:Promise.reject({code:'CONNECTOR_UPSTREAM_ERROR',message:status===400?'bad request':'unauthorized'})});
   const response=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:`rpc-${status}`,method:'connector.action.execute',params:{connectorKey:'resend',action:'emails.send'}})}));
   expect(response.status).toBe(502);
   const body=await response.json() as {error:Record<string,unknown>};
   expect(body.error).toMatchObject({code:'CONNECTOR_UPSTREAM_ERROR'});
   expect(body.error).not.toHaveProperty('retryAfterSeconds');
  }
 }finally{defaultConnectorRegistry.executeAction=original;}
});
test('admission limits reject overflow and recycle only after accepted work drains',async()=>{
 const original=defaultConnectorRegistry.executeAction; let resolve!:()=>void;
 defaultConnectorRegistry.executeAction=()=>({ok:true,output:new Promise<void>(r=>resolve=r)});
 let recycled=0;const handler=createFetchHandler({maxConcurrent:1,maxQueued:0,maxJobs:1,onRecycle:()=>recycled++});
 const request=()=>new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'a',method:'connector.action.execute',params:{connectorKey:'resend',action:'emails.send'}})});
 try{const pending=handler(request());await new Promise(r=>setTimeout(r,1));expect((await handler(request())).status).toBe(503);expect(recycled).toBe(0);resolve();await pending;expect(recycled).toBe(1);expect((await handler(request())).status).toBe(503);}finally{defaultConnectorRegistry.executeAction=original;}
});
function admissionRequest(bodyID: string, headerID?: string): Request {
 const headers = headerID === undefined ? undefined : {'x-request-id': headerID};
 return new Request('http://local/rpc', {
  method: 'POST',
  ...(headers ? {headers} : {}),
  body: JSON.stringify({
   id: bodyID,
   method: 'connector.action.execute',
   params: {connectorKey: 'resend', action: 'emails.send'},
  }),
 });
}
function describeAdmissionRequest(bodyID: string, headerID?: string): Request {
 const headers = headerID === undefined ? undefined : {'x-request-id': headerID};
 return new Request('http://local/rpc', {
  method: 'POST',
  ...(headers ? {headers} : {}),
  body: JSON.stringify({id: bodyID, method: 'runner.describe'}),
 });
}
test('saturated admission returns a correlated RUNNER_BUSY envelope', async () => {
 const original = defaultConnectorRegistry.executeAction;
 let release: (() => void) | undefined;
 let started!: () => void;
 const admitted = new Promise<void>(resolve => { started = resolve; });
 defaultConnectorRegistry.executeAction = () => ({
  ok: true,
  output: new Promise<void>(resolve => { release = resolve; started(); }),
 });
 const handler = createFetchHandler({maxConcurrent: 1, maxQueued: 0});
 const pending = handler(admissionRequest('body-held', 'held-id'));
 try {
  await admitted;
  const response = await handler(admissionRequest('body-rejected', 'rejected-id'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
   id: 'rejected-id',
   ok: false,
   error: {code: 'RUNNER_BUSY', message: 'Runner admission limit reached.'},
  });
 } finally {
  release?.();
  await pending;
  defaultConnectorRegistry.executeAction = original;
 }
});
test('draining admission returns a correlated RUNNER_BUSY envelope', async () => {
 const handler = createFetchHandler({maxConcurrent: 1, maxQueued: 0, maxJobs: 1});
 expect((await handler(describeAdmissionRequest('body-accepted', 'accepted-id'))).status).toBe(200);
 const response = await handler(describeAdmissionRequest('body-drained', 'drained-id'));
 expect(response.status).toBe(503);
 expect(await response.json()).toEqual({
  id: 'drained-id',
  ok: false,
  error: {code: 'RUNNER_BUSY', message: 'Runner admission limit reached.'},
 });
});
test('early admission omits missing and unsafe correlation headers', async () => {
 const original = defaultConnectorRegistry.executeAction;
 let release: (() => void) | undefined;
 let started!: () => void;
 const admitted = new Promise<void>(resolve => { started = resolve; });
 defaultConnectorRegistry.executeAction = () => ({
  ok: true,
  output: new Promise<void>(resolve => { release = resolve; started(); }),
 });
 const handler = createFetchHandler({maxConcurrent: 1, maxQueued: 0});
 const pending = handler(admissionRequest('body-held', 'held-id'));
 try {
  await admitted;
  for (const headerID of [undefined, 'unsafe id', 'x'.repeat(257)]) {
   const body = await (await handler(admissionRequest('body-unread', headerID))).json();
   expect(body).toEqual({
    ok: false,
    error: {code: 'RUNNER_BUSY', message: 'Runner admission limit reached.'},
   });
  }
 } finally {
  release?.();
  await pending;
  defaultConnectorRegistry.executeAction = original;
 }
});
test('caller deadline aborts the dispatched provider request at RPC boundary',async()=>{
 const original=globalThis.fetch;let aborted=false;
 globalThis.fetch=(async(_url:any,init:any)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>{aborted=true;reject(init.signal.reason)},{once:true})})) as typeof fetch;
 try{
 const response=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'deadline',deadlineUnixMs:Date.now()+20,method:'connector.action.execute',params:{connectorKey:'resend',action:'emails.send',input:{apiKey:'known-secret',from:'a@test.com',to:['b@test.com'],subject:'hello',text:'body'}}})}));
 expect(response.status).toBe(504);expect(aborted).toBe(true);
 }finally{globalThis.fetch=original;}
});
test('handwritten RPC errors redact exact known credentials',async()=>{
 const original=defaultConnectorRegistry.executeAction;
 defaultConnectorRegistry.executeAction=()=>({ok:true,output:Promise.reject({code:'CONNECTOR_UPSTREAM_ERROR',message:'reflected very-short-secret'})});
 try{const response=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'secret',method:'connector.action.execute',params:{connectorKey:'resend',action:'emails.send',input:{apiKey:'very-short-secret'}}})}));expect((await response.json()).error.message).toBe('reflected [REDACTED]');}finally{defaultConnectorRegistry.executeAction=original;}
});
test('RPC wire bounds reject oversized input and output',async()=>{
 const input=await handleRPC(new Request('http://local/rpc',{method:'POST',body:' '.repeat(25*1024*1024+256*1024+1)}));expect(input.status).toBe(413);
 const original=defaultConnectorRegistry.executeAction;
 defaultConnectorRegistry.executeAction=()=>({ok:true,output:{data:'x'.repeat(8*1024*1024)}});
 try{const output=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'big',method:'connector.action.execute',params:{connectorKey:'apify',action:'actor.run_sync_get_dataset_items'}})}));expect(output.status).toBe(200);expect((await output.json()).result.output.data.length).toBe(8*1024*1024);}finally{defaultConnectorRegistry.executeAction=original;}
});

test('RPC counts operation output separately from envelope overhead',async()=>{
 const original=defaultConnectorRegistry.executeAction;
 const action='actor.run_sync_get_dataset_items'; const maxResponseBytes=50*1024*1024;
 const emptyOutput={connector:'apify',action,data:''};
 const outputPrefix=new TextEncoder().encode(JSON.stringify(emptyOutput)).byteLength;
 const data='x'.repeat(maxResponseBytes-outputPrefix);
 defaultConnectorRegistry.executeAction=()=>({ok:true,output:{data}});
 try{
  const response=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'envelope',method:'connector.action.execute',params:{connectorKey:'apify',action}})}));
  const body=await response.text();
  expect(response.status).toBe(200);
  expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(maxResponseBytes);
  expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(maxResponseBytes+256*1024);
 }finally{defaultConnectorRegistry.executeAction=original;}
});

test('RPC rejects an operation result over its declared response budget',async()=>{
 const original=defaultConnectorRegistry.executeAction;
 const action='actor.run_sync_get_dataset_items'; const maxResponseBytes=50*1024*1024;
 const outputPrefix=new TextEncoder().encode(JSON.stringify({connector:'apify',action,data:''})).byteLength;
 defaultConnectorRegistry.executeAction=()=>({ok:true,output:{data:'x'.repeat(maxResponseBytes-outputPrefix+1)}});
 try{
  const response=await handleRPC(new Request('http://local/rpc',{method:'POST',body:JSON.stringify({id:'over-budget',method:'connector.action.execute',params:{connectorKey:'apify',action}})}));
  expect(response.status).toBe(502); expect((await response.json()).error.code).toBe('OUTPUT_TOO_LARGE');
 }finally{defaultConnectorRegistry.executeAction=original;}
});
