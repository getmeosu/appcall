import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// Handler evidence only: bundled Datastar owns the network and DOM patching.
function fixture(present = true) {
  const nodes = new Map(), listeners = {}, microtasks = [];
  const node = (id, extra = {}) => {
    const n = { id, attrs: {}, children: [], disabled: false, isConnected: true, textContent: '',
      setAttribute(k,v) { this.attrs[k]=String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; },
      replaceChildren(...children) { this.children=children.flatMap(c=>c.fragmentChildren??[c]);this.textContent=this.children.map(c=>c.textContent).join(''); },
      querySelector() { return null; }, ...extra };
    nodes.set(id,n); return n;
  };
  const idle=node('idle',{attrs:{'aria-hidden':'false'}}),working=node('working',{attrs:{'aria-hidden':'true'}});
  const button=node('button',{querySelector:s=>s==='.ui-button-idle'?idle:s==='.ui-button-working'?working:null});
  const fields=['name','email','notes'].map(name=>node(name,{name,value:'private-'+name}));
  const form=node('toolkit-request-form',{checkValidity:()=>true,querySelector:()=>button});
  const result=node('toolkit-request-result');
  // Server-rendered shared recovery template; rendering and privacy are asserted in Rust.
  node('toolkit-request-recovery',{content:{cloneNode(){return {fragmentChildren:[
    node('alert',{attrs:{role:'alert'},textContent:'Appcall could not confirm receipt of this connector request. Open Support to check whether it was received before submitting another request.'}),
    node('support',{attrs:{href:'/app/support'},textContent:'Open Support'}),
  ]};}}});
  if (!present) nodes.delete(form.id);
  const document={getElementById:id=>nodes.get(id),createElement:tag=>node('created-'+nodes.size,{tag}),
    addEventListener(type,fn,options) { (listeners[type]??=[]).push({fn,capture:options===true}); }};
  vm.runInNewContext(fs.readFileSync(new URL('../static/dashboard.js',import.meta.url),'utf8'),{document,WeakMap,Map,queueMicrotask:fn=>microtasks.push(fn)});
  const emit=(type,target,extra={})=>{const event={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const {fn} of listeners[type]??[]){fn(event);if(event.stopped)break;}return event;};
  const fetch=(type,argsRaw={})=>emit('datastar-fetch',document,{detail:{type,el:form,argsRaw}});
  return {node,nodes,form,result,button,idle,working,fields,listeners,emit,fetch,flush(){while(microtasks.length)microtasks.shift()();}};
}
test('catalog keyboard submit synchronously guards duplicates, preserves fields and clears old receipt',()=>{
  const f=fixture();f.result.textContent='Connector request received.';f.result.setAttribute('data-request-state','success');
  assert.equal(f.emit('submit',f.form).stopped,undefined);
  assert.equal(f.emit('submit',f.form).stopped,true);
  assert.equal(f.listeners.submit.some(l=>l.capture),true);
  assert.doesNotMatch(f.result.textContent,/received/);assert.equal(f.result.attrs['data-request-state'],undefined);
  assert.match(f.result.textContent,/Submitting/);assert.equal(f.form.attrs['aria-busy'],'true');assert.equal(f.result.attrs['aria-busy'],'true');
  assert.equal(f.button.disabled,false);f.flush();assert.equal(f.button.disabled,false); // Capture-listener microtasks may run before Datastar's target listener.
  f.fetch('started');f.flush();assert.equal(f.button.disabled,true);
  assert.deepEqual(f.fields.map(n=>[n.name,n.value,n.disabled]),[['name','private-name',false],['email','private-email',false],['notes','private-notes',false]]);
  assert.equal(f.working.attrs['aria-hidden'],'false');assert.equal(f.idle.attrs['aria-hidden'],'true');
});
for (const state of ['success','error']) test(`delayed applied ${state} survives target replacement and restores controls only at finish`,()=>{
  const f=fixture();f.emit('submit',f.form);f.fetch('started');f.flush();
  const current=f.node('toolkit-request-result',{attrs:{'data-request-state':state},textContent:state==='success'?'Connector request received.':'Server recovery'});
  f.fetch('datastar-patch-elements',{elements:'ignored'});assert.equal(f.emit('submit',f.form).stopped,true);
  f.fetch('finished');assert.equal(current.textContent,state==='success'?'Connector request received.':'Server recovery');
  assert.equal(current.attrs['aria-busy'],'false');assert.equal(f.form.attrs['aria-busy'],'false');assert.equal(f.button.disabled,false);
  assert.equal(f.idle.attrs['aria-hidden'],'false');assert.equal(f.working.attrs['aria-hidden'],'true');
  assert.equal(f.emit('submit',f.form).stopped,undefined);
});
for (const ending of ['missing','failed-patch','error','retrying','non200']) test(`${ending} keeps guard until finished and gives private neutral uncertainty`,()=>{
  const f=fixture();f.result.setAttribute('data-request-state','error');f.emit('submit',f.form);f.fetch('started');f.flush();
  if (ending==='failed-patch') f.fetch('datastar-patch-elements',{elements:'<div id="toolkit-request-result" data-request-state="success">PRIVATE</div>'});
  else if (ending!=='missing') f.fetch(ending==='non200'?'error':ending,{message:'PRIVATE'});
  assert.equal(f.emit('submit',f.form).stopped,true);assert.equal(f.button.disabled,true);f.fetch('finished');
  assert.match(f.result.textContent,/could not confirm receipt/);assert.match(f.result.textContent,/before submitting another request/);
  assert.doesNotMatch(f.result.textContent,/PRIVATE|rejected|not stored|try again/i);
  assert.equal(f.result.children.some(n=>n.attrs.role==='alert'),true);
  assert.equal(f.result.children.some(n=>n.attrs.href==='/app/support'),true);
  assert.equal(f.button.disabled,false);assert.equal(f.result.attrs['aria-busy'],'false');
});
test('invalid submit never starts busy and a finished request before microtask does not disable controls',()=>{
  const f=fixture();f.form.checkValidity=()=>false;assert.equal(f.emit('submit',f.form).stopped,true);assert.equal(f.form.attrs['aria-busy'],undefined);
  f.form.checkValidity=()=>true;f.emit('submit',f.form);f.fetch('finished');f.flush();assert.equal(f.button.disabled,false);
});
test('absent catalog form installs no request submit or transport handler',()=>{
  const f=fixture(false);assert.equal(f.listeners.submit?.length,1);assert.equal(f.listeners['datastar-fetch'],undefined);
});
test('unrelated forms and their transport events cannot start or finish the catalog attempt',()=>{
  const f=fixture(),other=f.node('another-form');assert.equal(f.emit('submit',other).stopped,undefined);
  f.emit('datastar-fetch',other,{detail:{type:'started',el:other}});assert.equal(f.form.attrs['aria-busy'],undefined);
  f.emit('submit',f.form);f.fetch('started');f.flush();
  f.emit('datastar-fetch',other,{detail:{type:'finished',el:other}});assert.equal(f.button.disabled,true);
  f.fetch('finished');assert.equal(f.button.disabled,false);
});
