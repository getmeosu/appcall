import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
// Only browser boundaries are doubled: delegated events, native dialog task timing,
// fetch and inert parsing. These tests run the shipped script, without exported hooks.
function fixture({narrow=false, capable=true}={}) {
  const listeners = new Map(), nodes = new Map(), tasks=[], calls=[];
  const on=(obj,type,fn,capture=false)=>{ const key=obj.id+':'+type; listeners.set(key,[...(listeners.get(key)||[]),{fn,capture}]); };
  const document={id:'document',readyState:'complete',activeElement:null};
  const emit=(type,target,extra={})=>{
    const event={type,target,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
    const bubbles=!['close','cancel'].includes(type);
    for(const {fn,capture} of listeners.get(document.id+':'+type)||[]) if(capture) fn(event);
    for(const {fn} of listeners.get(target.id+':'+type)||[]) fn(event);
    if(bubbles) for(const {fn,capture} of listeners.get(document.id+':'+type)||[]) if(!capture) fn(event);
    return event;
  };
  function node(id,tagName='DIV',attrs={}) {
    const n={id,tagName,attrs:{...attrs},dataset:{},children:[],parentElement:null,isConnected:true,hidden:false,textContent:'',open:false,
      addEventListener(type,fn,capture=false){on(this,type,fn,capture);},
      getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return k in this.attrs;},
      setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},
      focus(){document.activeElement=this;},
      matches(s){return s.split(',').some(raw=>{const q=raw.trim(); if(q===':modal'||q==='dialog:modal')return !!this.modal;
        if(q.startsWith('#'))return q.slice(1)===this.id;
        if(q==='dialog[open]')return tagName==='DIALOG'&&this.open;
        if(q==='dialog.ui-confirm-dialog[open]')return this.open&&this.attrs.class==='ui-confirm-dialog';
        const match=q.match(/^([a-z]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/i);
        return !!match&&(!match[1]||match[1].toUpperCase()===tagName)&&(!match[2]||(this.hasAttribute(match[2])&&(match[3]===undefined||this.getAttribute(match[2])===match[3])));});},
      closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;},
      querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);},
      querySelector(s){return this.querySelectorAll(s)[0]||null;},
      append(...children){for(const c of children){this.children.push(c);c.parentElement=this;}},
      replaceChildren(...children){this.children=[];this.textContent='';this.append(...children);},
      show(){if(this.open)throw Error('already open');this.open=true;this.modal=false;},
      showModal(){if(this.open)throw Error('already open');this.open=true;this.modal=true;},
      close(){if(!this.open)return;this.open=false;this.modal=false;tasks.push(()=>emit('close',this));},
    }; nodes.set(id,n);return n;
  }
  document.addEventListener=(type,fn,capture=false)=>on(document,type,fn,capture);
  document.getElementById=id=>nodes.get(id)||null;
  document.querySelectorAll=s=>[...nodes.values()].filter(n=>n.matches(s));
  document.querySelector=s=>document.querySelectorAll(s)[0]||null;
  const page=node('logs-page','SECTION'); document.body=page;
  const heading=node('logs-heading','H2');
  const dialog=node('logs-inspector','DIALOG');
  const result=node('logs-inspector-result','DIV',{'aria-busy':'false'});
  const close=node('logs-inspector-close','FORM',{method:'dialog'});close.append(node('close-button','BUTTON'));
  const full=node('full-link','A',{href:'/app/logs'}),fullWrapper=node('logs-inspector-full','SPAN'),login=node('logs-inspector-login','SPAN');
  fullWrapper.append(full);login.append(node('login-link','A',{href:'/app/login'}));
  dialog.append(close,fullWrapper,login,result);page.append(heading,dialog);
  const rows=['A','B'].map(id=>{const row=node('row-'+id,'TR',{'data-log-row':''}); const a=node('inspect-'+id,'A',{href:'/app/logs/'+id});row.append(a);page.append(row);return {row,a};});
  if(!capable)dialog.show=dialog.showModal=undefined;
  const media={matches:narrow,addEventListener(type,fn){this.change=fn;}};
  const window={location:new URL('https://app.test/app/logs?status=failed'),matchMedia:()=>media,getSelection:()=>({toString:()=>window.selection||''})};
  class DOMParser {
    parseFromString(text){
      const body=node('parsed-body','BODY');
      const match=text.match(/^<section id="trace-content" data-request-id="([^"]+)">/);
      if(match){const root=node('parsed-trace','SECTION',{'data-request-id':match[1]});root.id='trace-content';root.dataset.requestId=match[1];root.append(node('trace-title','H2'));if(text.includes('<script'))root.append(node('script','SCRIPT'));body.append(root);}
      return {body,querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s)};
    }
  }
  const fetch=(url,options)=>{const d=deferred();calls.push({url:String(url),options,...d});return d.promise;};
  const path=new URL('../static/logs.js',import.meta.url);
  vm.runInNewContext(fs.existsSync(path)?fs.readFileSync(path,'utf8'):'',{document,window,URL,AbortController,DOMParser,fetch});
  return {nodes,document,dialog,result,close,full,login,rows,calls,media,window,emit,tasks,node,
    flush(){while(tasks.length)tasks.shift()();},click(i=0,extra={}){return emit('click',rows[i].a,extra);}};
}
function response(id='A',extra={}) {return {status:200,ok:true,redirected:false,url:'https://app.test/app/logs/'+id+'?view=drawer',headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>`<section id="trace-content" data-request-id="${id}"><h2 id="trace-title">Request Trace</h2></section>`,...extra};}
function started(f,i=0){const e=f.click(i);assert.equal(e.defaultPrevented,true,'supported Inspect is enhanced');assert.equal(f.dialog.open,true);assert.equal(f.calls.length,i+1);return f.calls[i];}

test('Inspect opens modeless desktop, clears old content, makes exactly one bounded same-origin GET',async()=>{
  const f=fixture();f.result.textContent='old trace';const call=started(f);
  assert.equal(f.dialog.modal,false);assert.equal(f.result.textContent.includes('old trace'),false);
  assert.equal(f.result.getAttribute('aria-busy'),'true');assert.equal(f.document.activeElement,f.close.children[0]);
  assert.equal(call.url,'https://app.test/app/logs/A?view=drawer');assert.equal(call.options.method,'GET');
  assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.redirect,'error');
  f.click();assert.equal(f.calls.length,1);call.resolve(response());await tick();
  assert.equal(f.result.querySelector('#trace-content').dataset.requestId,'A');
  assert.equal(f.result.getAttribute('aria-busy'),'false');assert.equal(f.document.activeElement.id,'trace-title');
  assert.equal(f.full.getAttribute('href'),'/app/logs/A');assert.equal(f.window.location.search,'?status=failed');
});
test('modifier, middle, target/download, selected text, invalid links and unavailable dialog retain navigation',()=>{
  for(const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]){const f=fixture();assert.equal(f.click(0,extra).defaultPrevented,false);assert.equal(f.calls.length,0);}
  for(const attrs of [{target:'_blank'},{download:''},{href:'https://evil.test/app/logs/A'},{href:'/app/logs/A/replay'},{href:'/app/logs/%2f'},{href:'/app/logs/..'},{href:'/app/logs/'+ 'x'.repeat(257)}]){
    const f=fixture();Object.assign(f.rows[0].a.attrs,attrs);assert.equal(f.click().defaultPrevented,false);assert.equal(f.calls.length,0);
  }
  const f=fixture({capable:false});assert.equal(f.click().defaultPrevented,false);
  const selection=fixture();selection.window.selection='selected';assert.equal(selection.click().defaultPrevented,false);
});
test('plain row click opens its actual Inspect anchor',()=>{const f=fixture();const event=f.emit('click',f.rows[0].row);assert.equal(event.defaultPrevented,true);assert.equal(f.calls.length,1);f.emit('submit',f.close);f.flush();assert.equal(f.document.activeElement,f.rows[0].a);});
test('another control inside a row retains its own native action',()=>{
  const f=fixture();const control={id:'other',closest:s=>s.includes('button')?control:s==='[data-log-row]'?f.rows[0].row:null};
  assert.equal(f.emit('click',control).defaultPrevented,false);assert.equal(f.calls.length,0);
});
for(const [label,overrides,copy] of [
  ['session',{status:401,ok:false},/sign in|session/i],['denied',{status:403,ok:false},/access|permission/i],['outage',{status:503,ok:false},/unavailable|try again/i],
  ['redirect',{redirected:true},/could not|unable|unavailable/i],['wrong URL',{url:'https://evil.test/app/logs/A?view=drawer'},/could not|unable|unavailable/i],
  ['content type',{headers:{get:()=> 'application/json'}},/could not|unable|unavailable/i],
  ['login document',{text:async()=>'<html><body>private raw failure</body></html>'},/could not|unable|unavailable/i],
  ['different request',{text:async()=>'<section id="trace-content" data-request-id="B"></section>'},/could not|unable|unavailable/i],
  ['script',{text:async()=>'<section id="trace-content" data-request-id="A"><script>evil()</script></section>'},/could not|unable|unavailable/i],
]) test(`rejects ${label} without injecting raw response or executing`,async()=>{
  const f=fixture();started(f).resolve(response('A',overrides));await tick();
  assert.equal(f.result.getAttribute('role'),'alert');assert.match(f.result.textContent,copy);
  assert.equal(f.result.querySelector('#trace-content'),null);assert.equal(f.result.getAttribute('aria-busy'),'false');assert.equal(f.calls.length,1);
  assert.equal(f.result.textContent.includes('private raw failure'),false);if(label==='session'){
    assert.equal(f.login.hidden,false);
    assert.doesNotMatch(f.result.textContent,/expired|revoked|corrupt|missing/i,'401 does not identify why authentication failed');
  }
});
for(const outcome of ['success','error']) test(`older A ${outcome} and finally cannot change pending B`,async()=>{
  const f=fixture();const a=started(f),b=started(f,1);assert.equal(a.options.signal.aborted,true);
  if(outcome==='success')a.resolve(response());else a.reject(Error('private detail'));await tick();
  assert.equal(f.result.getAttribute('aria-busy'),'true');assert.equal(f.result.querySelector('#trace-content'),null);
  b.resolve(response('B'));await tick();assert.equal(f.result.querySelector('#trace-content').dataset.requestId,'B');
});
for(const phase of ['fetch','body']) test(`close during ${phase} invalidates late fulfillment before queued close`,async()=>{
  const f=fixture(),body=deferred();const a=started(f);
  if(phase==='body'){a.resolve(response('A',{text:()=>body.promise}));await tick();}
  f.emit('submit',f.close);assert.equal(a.options.signal.aborted,true);const old=f.result.textContent;
  if(phase==='fetch')a.resolve(response());else body.resolve('<section id="trace-content" data-request-id="A"></section>');await tick();
  assert.equal(f.dialog.open,false);assert.equal(f.result.textContent,old);assert.equal(f.result.querySelector('#trace-content'),null);f.flush();assert.equal(f.document.activeElement,f.rows[0].a);
});
test('close then open B before queued close does not abort B or restore A focus',async()=>{
  const f=fixture();started(f);f.emit('submit',f.close);const b=started(f,1);f.flush();
  assert.equal(f.dialog.open,true);assert.equal(b.options.signal.aborted,false);assert.notEqual(f.document.activeElement,f.rows[0].a);
  b.resolve(response('B'));await tick();assert.equal(f.result.querySelector('#trace-content').dataset.requestId,'B');
});
test('desktop Escape respects nested confirmation, then closes and restores fallback if invoker detached',()=>{
  const f=fixture();started(f);const nested={id:'nested',tagName:'DIALOG',open:true,attrs:{class:'ui-confirm-dialog'},matches(s){return this.open&&s.includes('dialog');}};f.nodes.set('nested',nested);
  assert.equal(f.emit('keydown',f.dialog,{key:'Escape'}).defaultPrevented,false);assert.equal(f.dialog.open,true);
  nested.open=false;f.rows[0].a.isConnected=false;f.emit('keydown',f.dialog,{key:'Escape'});f.flush();assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement.id,'logs-heading');
});
test('desktop Escape leaves an unrelated native modal to its own handler',()=>{
  const f=fixture();started(f);
  const palette={id:'cmdk',tagName:'DIALOG',open:true,modal:true,matches(s){return this.open&&(s==='dialog:modal'||s===':modal'||s==='dialog[open]');}};
  f.nodes.set('cmdk',palette);
  const escape=f.emit('keydown',f.dialog,{key:'Escape'});
  assert.equal(f.dialog.open,true,'Escape in the command palette must not close the inspector beneath it');
  assert.equal(escape.defaultPrevented,false,'the modal keeps ownership of Escape');
});
test('narrow uses native modal; resize queued close cannot clear reopened inspector or a newer request',async()=>{
  const f=fixture({narrow:true});started(f);assert.equal(f.dialog.modal,true);
  f.media.matches=false;f.media.change();assert.equal(f.dialog.open,true);assert.equal(f.dialog.modal,false);
  const b=started(f,1);f.flush();assert.equal(f.dialog.open,true);assert.equal(b.options.signal.aborted,false);
  b.resolve(response('B'));await tick();assert.equal(f.result.querySelector('#trace-content').dataset.requestId,'B');
  f.emit('cancel',f.dialog);assert.equal(f.dialog.open,false);assert.equal(b.options.signal.aborted,true);
});
for(const owner of ['replay','cmdk']) test(`resize waits for ${owner} modal to close before changing inspector mode`,async()=>{
  const f=fixture();const request=started(f);
  const modal=f.node(owner,'DIALOG',owner==='replay'?{class:'ui-confirm-dialog'}:{});
  if(owner==='replay')f.result.append(modal);
  modal.showModal();modal.focus();
  f.media.matches=true;f.media.change();
  assert.equal(f.dialog.modal,false,'inspector must not enter the top layer above the active modal');
  assert.equal(f.document.activeElement,modal);
  assert.equal(request.options.signal.aborted,false);
  modal.close();assert.equal(f.dialog.modal,false,'native close reconciliation waits for the close task');
  f.flush();assert.equal(f.dialog.modal,true,'captured native close reconciles the latest breakpoint');
  assert.equal(request.options.signal.aborted,false);
  request.resolve(response());await tick();assert.equal(f.result.querySelector('#trace-content').dataset.requestId,'A');
});
test('deferred resize uses the latest breakpoint without close/reopen churn',()=>{
  const f=fixture();const request=started(f);const modal=f.node('cmdk','DIALOG');modal.showModal();
  f.media.matches=true;f.media.change();f.media.matches=false;f.media.change();
  modal.close();assert.equal(f.tasks.length,1,'unchanged final mode must not enqueue inspector close events');
  f.flush();assert.equal(f.dialog.open,true);assert.equal(f.dialog.modal,false);assert.equal(request.options.signal.aborted,false);
});
test('closing inspector while mode change is deferred prevents reopening after modal close',()=>{
  const f=fixture();const request=started(f);const modal=f.node('cmdk','DIALOG');modal.showModal();
  f.media.matches=true;f.media.change();f.emit('submit',f.close);modal.close();f.flush();
  assert.equal(f.dialog.open,false);assert.equal(request.options.signal.aborted,true);
});
test('current inspected row and its native link follow A to B and clear on close despite late A',async()=>{
  const f=fixture();const a=started(f);
  assert.equal(f.rows[0].row.hasAttribute('data-inspected'),true);
  assert.equal(f.rows[0].a.getAttribute('aria-current'),'true');
  assert.equal(f.rows[0].a.getAttribute('aria-controls'),'logs-inspector');
  const b=started(f,1);
  assert.equal(f.rows[0].row.hasAttribute('data-inspected'),false);
  assert.equal(f.rows[0].a.hasAttribute('aria-current'),false);
  assert.equal(f.rows[1].row.hasAttribute('data-inspected'),true);
  assert.equal(f.rows[1].a.getAttribute('aria-current'),'true');
  a.resolve(response());await tick();
  assert.equal(f.rows[1].row.hasAttribute('data-inspected'),true);
  f.emit('submit',f.close);f.flush();b.resolve(response('B'));await tick();
  for(const {row,a:anchor} of f.rows){
    assert.equal(row.hasAttribute('data-inspected'),false);assert.equal(row.hasAttribute('aria-selected'),false);
    assert.equal(anchor.hasAttribute('aria-current'),false);assert.equal(anchor.hasAttribute('aria-controls'),false);
  }
});
const styleSource=fs.readFileSync(new URL('../styles/app.css',import.meta.url),'utf8');
function cssRule(selector){const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return styleSource.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1]||'';}
test('Logs scoped typography follows Signal title, section and mono label roles',()=>{
  assert.match(cssRule('.logs-heading h2'),/font-size:\s*20px/);assert.match(cssRule('.logs-heading h2'),/line-height:\s*26px/);
  assert.match(cssRule('.logs-table th'),/font-size:\s*10\.5px/);assert.match(cssRule('.logs-table th'),/line-height:\s*14px/);
  assert.match(cssRule('.logs-table th'),/font-family:\s*var\(--font-mono\)/);
  assert.match(cssRule('.logs-inspector-heading h2'),/font-size:\s*14px/);assert.match(cssRule('.logs-inspector-heading h2'),/line-height:\s*20px/);
});
test('inspected row uses a structural iris rule',()=>{
  const rule=cssRule('.logs-table tr[data-inspected] > td:first-child');
  assert.match(rule,/border-left:\s*2px solid var\(--color-iris-400\)/);
});
test('Close form margin reset is scoped and unlayered to override the shell form default',()=>{
  const selector='#main-content #logs-inspector-close';
  assert.match(cssRule(selector),/margin:\s*0/);
  const start=styleSource.indexOf(selector);let depth=0;
  for(const char of styleSource.slice(0,start)){if(char==='{')depth++;if(char==='}')depth--;}
  assert.equal(depth,0,'unlayered shell margin cannot be overridden inside a component layer');
});
