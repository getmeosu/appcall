import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function fixture(destructive = false) {
  const nodes = new Map(), listeners = {}, microtasks = [];
  const document = { getElementById: id => nodes.get(id), activeElement: null,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  function node(id, extra = {}) {
    const n = { id, dataset: {}, attrs: {}, disabled: false, isConnected: true, value: '', textContent: '',
      setAttribute(k,v) { this.attrs[k]=String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; }, focus() { document.activeElement=this; },
      children: [],
      prepend(child) { this.children.unshift(child); },
      replaceChildren(...children) { this.children=children; this.textContent=children.map(c=>c.textContent).join(''); },
      closest(s) { return this.matches?.(s) ? this : null; }, querySelectorAll() { return []; }, querySelector(s) { return this.children.find(c=>s==='[role="alert"]' && c.attrs.role==='alert') || null; }, ...extra };
    nodes.set(id,n); return n;
  }
  const root=node('tk-detail',{dataset:{toolkitKey:'provider'}});
  let elementSequence=0;document.createElement=()=>node('created-'+elementSequence++);
  const tabs=['tools','accounts','events','code','settings'].map((name,i)=>{
    const wrap=node('tk-tab-'+name,{dataset:{tab:name,selected:String(!i)}});
    const a=node('tab-'+name,{parentElement:wrap,attrs:{href:'/app/connectors/provider?tab='+name+'&action=mail.read&callerToken=SECRET',...(i===0?{'aria-current':'page'}:{})},matches:s=>s==='#tk-tabs a'});
    wrap.querySelector=()=>a; node('tk-panel-'+name,{hidden:!!i}); return a;
  });
  const rail=['mail.read','mail.write'].map(action=>node(action,{attrs:{href:'/app/connectors/provider?action='+action},matches:s=>s==='.tk-tool-item a'}));
  node('tk-tabs',{querySelectorAll:()=>tabs});
  const account=node('tk-connection',{value:'active_1',options:[{value:'active_1',disabled:false},{value:'active_2',disabled:false}]});
  const selection=node('tk-selection-connection');node('tk-selected-action',{value:'mail.read'});
  node('tk-code-data',{content:{textContent:JSON.stringify({action:"mail.read",body:{input:{query:"O'Brien"}}})}});
  node('tk-code-example');node('tk-status');node('tk-test-result');node('tk-test-fields');
  const inputs=[node('first',{name:'f.tag',value:'a'}),node('second',{name:'f.tag',value:'b'}),node('old',{disabled:true})];
  const idle=node('run-idle',{textContent:'Run tool',attrs:{'aria-hidden':'false'}});
  const working=node('run-working',{textContent:'Working…',attrs:{'aria-hidden':'true'}});
  const run=node('run',{querySelector:s=>s==='.ui-button-idle'?idle:s==='.ui-button-working'?working:null});const form=node('tk-run-form',{checkValidity:()=>true,reportValidity(){},querySelectorAll:()=>[account,...inputs,run]});
  node('tk-run-control',{querySelector:()=>run,querySelectorAll:()=>[run]});
  let confirm;
  if (destructive) {
    const confirmIdle=node('confirm-idle',{attrs:{'aria-hidden':'false'}}),confirmWorking=node('confirm-working',{attrs:{'aria-hidden':'true'}});
    confirm=node('confirm',{querySelector:s=>s==='.ui-button-idle'?confirmIdle:s==='.ui-button-working'?confirmWorking:null});
    confirm.closest=s=>s==='#tk-run-confirm [data-confirm-submit]'?confirm:null;
    node('tk-run-confirm',{open:false,querySelector:()=>confirm,close(){this.open=false;}});
  }
  root.querySelectorAll=s=>s==='.tk-tool-item a'?rail:s==='#tk-tabs a'?tabs:s==='a'? [...tabs,...rail]:[account,...inputs,run,...(confirm?[confirm]:[])];
  const clipboard={writeText:async text=>{ clipboard.copied=text; }};
  vm.runInNewContext(fs.readFileSync(new URL('../static/dashboard.js',import.meta.url),'utf8'),{document,window:{location:{href:'https://local.invalid/app/connectors/provider'},history:{replaceState(){}}},navigator:{clipboard},URL,URLSearchParams,WeakMap,Map,setTimeout,queueMicrotask:fn=>microtasks.push(fn)});
  const emit=(type,target,extra={})=>{const event={target,button:0,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of listeners[type]??[]){fn(event);if(event.stopped)break;}return event;};
  const fetch=(type,argsRaw={})=>emit('datastar-fetch',document,{detail:{type,el:form,argsRaw}});
  return {nodes,node,root,tabs,rail,account,selection,inputs,form,run,clipboard,emit,fetch,document,flush(){while(microtasks.length)microtasks.shift()();}};
}
test('tabs enhance real links with roving keyboard focus and Tab exits',()=>{
  const f=fixture();assert.equal(f.tabs[0].attrs.role,'tab');assert.equal(f.tabs[1].attrs.tabindex,'-1');
  f.emit('keydown',f.tabs[0],{key:'ArrowRight'});assert.equal(f.document.activeElement,f.tabs[1]);
  assert.equal(f.nodes.get('tk-panel-accounts').hidden,false);assert.equal(f.nodes.get('tk-panel-tools').hidden,true);
  f.emit('keydown',f.tabs[1],{key:'End'});assert.equal(f.document.activeElement,f.tabs[4]);
  assert.equal(f.emit('keydown',f.tabs[4],{key:'Tab'}).prevented,undefined);
  assert.equal(f.emit('click',f.tabs[4],{ctrlKey:true}).prevented,undefined);
  f.emit('keydown',f.rail[0],{key:'ArrowDown'});assert.equal(f.document.activeElement,f.rail[1]);
});
test('tab enhancement replaces native page-current semantics with tab selection',()=>{
  const f=fixture();
  assert.equal(f.tabs[0].attrs['aria-current'],undefined);
  assert.equal(f.tabs[0].attrs['aria-selected'],'true');
  assert.equal(f.tabs[1].attrs['aria-current'],undefined);
  assert.equal(f.tabs[1].attrs['aria-selected'],'false');
});
test('Run as refreshes navigation and inert sample using only eligible account',()=>{
  const f=fixture();f.account.value='active_2';f.emit('change',f.account);
  assert.equal(f.selection.value,'active_2');
  for(const a of [...f.tabs,...f.rail]) {assert.match(a.attrs.href,/connectionId=active_2/);assert.doesNotMatch(a.attrs.href,/SECRET|callerToken/);}
  const code=f.nodes.get('tk-code-example').textContent;
  assert.match(code,/connections\/active_2/);assert.match(code,/X-External-Account-Id: YOUR_EXTERNAL_ACCOUNT_ID/);assert.ok(code.includes("O'\"'\"'Brien"));
  f.account.value='foreign';f.emit('change',f.account);assert.equal(f.selection.value,'');
});
test('copy output only and report clipboard rejection',async()=>{
  const f=fixture();f.node('tk-output-json',{textContent:'{"ok":true}'});
  const button=f.node('copy',{closest:s=>s==='#tk-copy-json button'?button:null});
  f.emit('click',button);await Promise.resolve();assert.equal(f.clipboard.copied,'{"ok":true}');
  f.clipboard.writeText=async()=>{throw Error('denied');};f.emit('click',button);await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.nodes.get('tk-status').textContent,/Could not copy/);
});
test('submission snapshots enabled repeated values before queued lock, suppresses duplicates and restores disabled state',()=>{
  const f=fixture();f.emit('submit',f.form);f.fetch('started');
  assert.deepEqual(f.inputs.filter(n=>!n.disabled).map(n=>[n.name,n.value]),[['f.tag','a'],['f.tag','b']]);
  assert.equal(f.emit('submit',f.form).stopped,true);f.flush();assert.equal(f.run.disabled,true);
  assert.equal(f.nodes.get('tk-test-result').attrs['aria-busy'],'true');
  f.fetch('datastar-patch-elements',{elements:'<section id="tk-test-result">Succeeded</section>'});
  // Explicitly model the separately owned renderer applying its completion marker.
  f.nodes.get('tk-test-result').setAttribute('data-result-state','success');f.fetch('finished');
  assert.equal(f.nodes.get('tk-status').textContent,'Tool request completed.');
  assert.equal(f.run.disabled,false);assert.equal(f.inputs[2].disabled,true);assert.equal(f.nodes.get('tk-test-result').attrs['aria-busy'],'false');
});
test('run uses existing shared working labels and busy state, restores on finished without replacing labels',()=>{
  const f=fixture();const idle=f.nodes.get('run-idle'),working=f.nodes.get('run-working');
  assert.equal(working.textContent,'Running…');
  f.emit('submit',f.form,{submitter:f.run});f.fetch('started');
  assert.equal(f.run.attrs['aria-busy'],'true');assert.equal(idle.attrs['aria-hidden'],'true');assert.equal(working.attrs['aria-hidden'],'false');
  assert.equal(f.run.disabled,false); // FormData snapshot still precedes the queued control lock.
  f.flush();assert.equal(f.run.disabled,true);
  f.fetch('error');assert.equal(f.run.attrs['aria-busy'],'true');f.fetch('finished');
  assert.equal(f.run.attrs['aria-busy'],undefined);assert.equal(idle.attrs['aria-hidden'],'false');assert.equal(working.attrs['aria-hidden'],'true');
  assert.equal(f.run.querySelector('.ui-button-working'),working);assert.equal(f.run.querySelector('.ui-button-idle'),idle);
});
test('destructive execution shows working state on its visible trigger and actual confirm submitter',()=>{
  const f=fixture(true);const confirm=f.nodes.get('confirm');
  assert.equal(f.nodes.get('confirm-working').textContent,'Running…');
  f.nodes.get('tk-run-confirm').open=true;f.emit('click',confirm);f.emit('submit',f.form,{submitter:confirm});f.fetch('started');f.flush();
  for (const button of [f.run,confirm]) {assert.equal(button.attrs['aria-busy'],'true');assert.equal(button.disabled,true);assert.equal(button.querySelector('.ui-button-working').attrs['aria-hidden'],'false');}
  f.fetch('finished');
  for (const button of [f.run,confirm]) {assert.equal(button.attrs['aria-busy'],undefined);assert.equal(button.disabled,false);assert.equal(button.querySelector('.ui-button-working').attrs['aria-hidden'],'true');}
});
test('a patch event without an applied result does not claim completion',()=>{
  const f=fixture();f.emit('submit',f.form);f.fetch('started');
  f.fetch('datastar-patch-elements',{selector:'#tk-test-result',elements:'malformed'});f.fetch('finished');
  assert.match(f.nodes.get('tk-status').textContent,/No result/);
  assert.match(f.nodes.get('tk-test-result').textContent,/No result/);
});
test('a previous result is visibly cleared on a new attempt, and an applied error is never success',()=>{
  const f=fixture();const result=f.nodes.get('tk-test-result');result.textContent='OLD RESULT';result.setAttribute('data-result-state','success');
  f.emit('submit',f.form);f.fetch('started');assert.doesNotMatch(result.textContent,/OLD RESULT/);
  f.fetch('datastar-patch-elements',{selector:'#tk-test-result'});result.setAttribute('data-result-state','error');f.fetch('finished');
  assert.match(f.nodes.get('tk-status').textContent,/failed/);
});
test('invalid submit never starts busy; errors release only on finished and missing patches fail',()=>{
  const f=fixture();f.form.checkValidity=()=>false;assert.equal(f.emit('submit',f.form).stopped,true);
  f.form.checkValidity=()=>true;assert.equal(f.emit('submit',f.form).stopped,undefined);f.fetch('started');f.flush();
  f.fetch('retrying');assert.equal(f.run.disabled,true);f.fetch('finished');assert.equal(f.run.disabled,false);assert.match(f.nodes.get('tk-status').textContent,/tool may have run/i);
  f.emit('submit',f.form);f.fetch('started');f.fetch('finished');f.flush();assert.equal(f.run.disabled,false);assert.match(f.nodes.get('tk-status').textContent,/result/i);
});
test('decimal coordinates and amounts submit with raw JSON despite an invalid integer control',()=>{
  const f=fixture();
  const controls=[
    f.node('f.latitude',{name:'f.latitude',type:'number',value:'1.5',attrs:{step:'any'}}),
    f.node('f.longitude',{name:'f.longitude',type:'number',value:'-73.98',attrs:{step:'any'}}),
    f.node('f.amount',{name:'f.amount',type:'number',value:'12.75',attrs:{step:'any'}}),
    f.node('f.count',{name:'f.count',type:'number',value:'1.5',attrs:{step:'1'}}),
    f.node('tk-input-raw',{name:'input_raw',value:'{"latitude":1.5,"longitude":-73.98,"amount":12.75}'})
  ];
  const unrelated=f.node('unrelated',{name:'unrelated',required:true,value:'kept'});
  f.inputs.push(...controls,unrelated);
  const queryAll=f.root.querySelectorAll;
  f.root.querySelectorAll=selector=>selector==='[name^="f."]'
    ? f.inputs.filter(control=>control.name?.startsWith('f.'))
    : queryAll(selector);
  const nativeNumberIsValid=control=>{
    if(control.disabled)return true;
    if(control.type!=='number'||control.value==='')return true;
    const step=control.getAttribute('step');
    if(step==='any')return Number.isFinite(Number(control.value));
    const increment=Number(step||1),value=Number(control.value);
    return Number.isFinite(value)&&Number.isFinite(increment)&&increment>0&&Number.isInteger(value/increment);
  };
  f.form.checkValidity=()=>controls.every(nativeNumberIsValid)&&unrelated.value.trim()!=='';
  assert.equal(f.form.checkValidity(),false);
  f.emit('input',controls.at(-1));
  assert.equal(controls[3].disabled,true);
  assert.equal(controls.at(-1).disabled,false);
  assert.equal(unrelated.disabled,false);
  assert.equal(f.form.checkValidity(),true);
  assert.equal(f.emit('submit',f.form,{submitter:f.run}).stopped,undefined);
  f.fetch('started');f.flush();
  assert.equal(f.run.attrs['aria-busy'],'true');
  f.fetch('finished');
  unrelated.value='';
  assert.equal(unrelated.disabled,false);
  assert.equal(f.form.checkValidity(),false);
  assert.equal(f.emit('submit',f.form).stopped,true);
  unrelated.value='kept';
  controls.at(-1).value='';
  f.emit('input',controls.at(-1));
  assert.equal(controls[3].disabled,false);
  assert.equal(f.form.checkValidity(),false);
  assert.equal(f.emit('submit',f.form).stopped,true);
});
test('destructive submit requires an explicit confirmation click, updates current account, cancel does not execute',()=>{
  const f=fixture();
  const confirm=f.node('confirm');
  const dialog=f.node('tk-run-confirm',{open:false,querySelector:()=>confirm,close(){this.open=false;}});
  const trigger=f.node('trigger',{click(){dialog.open=true;}});
  f.node('tk-run-control',{querySelector:()=>trigger});f.node('tk-run-confirm-body');
  assert.equal(f.emit('submit',f.form).stopped,true);assert.equal(dialog.open,true);
  assert.equal(f.emit('submit',f.form,{submitter:confirm}).stopped,true);
  dialog.close();assert.equal(f.run.disabled,false);
  f.account.value='active_2';f.emit('change',f.account);assert.match(f.nodes.get('tk-run-confirm-body').textContent,/active_2/);
  dialog.open=true;confirm.closest=s=>s==='#tk-run-confirm [data-confirm-submit]'?confirm:null;
  f.emit('click',confirm);f.flush();assert.equal(f.emit('submit',f.form,{submitter:confirm}).stopped,undefined);
  assert.equal(dialog.open,false);
});
test('legacy field requests lock run and clear failed fields with target specific busy state',()=>{
  const f=fixture();const fields=f.nodes.get('tk-test-fields');
  const emit=(type,argsRaw={})=>f.emit('datastar-fetch',f.document,{detail:{type,el:f.account,argsRaw}});
  emit('started');f.flush();assert.equal(fields.attrs['aria-busy'],'true');assert.equal(f.run.disabled,true);
  assert.notEqual(f.nodes.get('tk-test-result').attrs['aria-busy'],'true');
  emit('error');emit('finished');assert.equal(fields.attrs['aria-busy'],'false');assert.match(fields.textContent,/could not be loaded/i);assert.equal(f.run.disabled,true);
});
test('filter matches tool titles and names and reports an empty search',()=>{
  const f=fixture();const filter=f.node('tk-tool-filter',{value:'write'});
  const items=f.rail.map((link,i)=>{const item=f.node('item-'+i,{textContent:link.id});link.closest=s=>s==='.tk-tool-item'?item:null;return item;});
  f.emit('input',filter);assert.equal(items[0].hidden,true);assert.equal(items[1].hidden,false);
  filter.value='unknown';f.emit('input',filter);assert.match(f.nodes.get('tk-status').textContent,/No matching tools/);
});

function dynamicOptionsFixture() {
  const nodes = new Map(), listeners = {}, microtasks = [];
  const document = { getElementById: id => nodes.get(id), activeElement: null,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    createElement: () => node('created-' + nodes.size) };
  function node(id, extra = {}) {
    const n = { id, dataset: {}, attrs: {}, hidden: false, disabled: false, isConnected: true,
      value: '', textContent: '', children: [],
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; },
      focus() { document.activeElement = this; },
      closest(s) { return this.matches?.(s) ? this : null; },
      querySelectorAll() { return []; }, querySelector() { return null; }, ...extra };
    nodes.set(id, n); return n;
  }
  const root = node('tk-detail', { dataset: { toolkitKey: 'provider' } });
  const tabs = ['tools', 'accounts', 'events', 'code', 'settings'].map((name, index) => {
    const wrap = node('tk-tab-' + name, { dataset: { tab: name, selected: String(index === 0) } });
    const link = node('tab-' + name, { parentElement: wrap,
      attrs: { href: '/app/connectors/provider?tab=' + name },
      matches: s => s === '#tk-tabs a' });
    wrap.querySelector = () => link; node('tk-panel-' + name, { hidden: index !== 0 }); return link;
  });
  node('tk-tabs', { querySelectorAll: () => tabs });
  node('tk-connection', { value: 'active_1', options: [{ value: 'active_1', disabled: false }] });
  node('tk-selection-connection', { value: '' });
  node('tk-selected-action', { value: 'mail.read' });
  node('tk-status');
  const search = node('tk-search-f.actor', { value: '',
    attrs: { role: 'combobox', 'aria-controls': 'tk-opts-f.actor', 'data-options-source': '/app/connectors/provider/options' },
    matches: s => s === '[role="combobox"][aria-controls]' || s === '[role="combobox"][aria-controls][data-options-source]' });
  const hidden = node('f.actor', { value: 'one' });
  const optionOne = node('tk-opt-f.actor-0', { textContent: 'One',
    attrs: { role: 'option', tabindex: '-1', 'data-value': 'one', 'aria-selected': 'false' },
    matches: s => s === '[role="option"]', click() { this.clicked = (this.clicked || 0) + 1; } });
  const optionTwo = node('tk-opt-f.actor-1', { textContent: 'Two',
    attrs: { role: 'option', tabindex: '-1', 'data-value': 'two', 'aria-selected': 'false' },
    matches: s => s === '[role="option"]' });
  let listOptions = [optionOne, optionTwo];
  const list = node('tk-opts-f.actor', { dataset: { inputId: search.id, valueId: hidden.id, statusId: 'tk-opts-f.actor-status' },
    attrs: { role: 'listbox', 'data-input-id': search.id, 'data-value-id': hidden.id, 'data-status-id': 'tk-opts-f.actor-status' }, querySelectorAll: s => s === '[role="option"]' ? listOptions : [] });
  for (const option of [optionOne, optionTwo]) option.closest = s => s === '[role="option"]' ? option : s === '[role="listbox"]' ? list : null;
  node('tk-opts-f.actor-status');
  const commandOption = node('cmdk-option-0', { textContent: 'Pages', attrs: { role: 'option' }, matches: s => s === '[role="option"]' });
  const commandList = node('cmdk-list', { hidden: false, attrs: { role: 'listbox' }, querySelectorAll: s => s === '[role="option"]' ? [commandOption] : [] });
  const commandSearch = node('cmdk-search', { value: '', attrs: { role: 'combobox', 'aria-controls': 'cmdk-list' },
    matches: s => s === '[role="combobox"][aria-controls]' });
  root.querySelectorAll = s => s === '#tk-tabs a' ? tabs : s === '.tk-tool-item a' ? [] : s === 'a' ? tabs : [];
  vm.runInNewContext(fs.readFileSync(new URL('../static/dashboard.js', import.meta.url), 'utf8'), {
    document, window: { location: { href: 'https://local.invalid/app/connectors/provider' }, history: { replaceState() {} } },
    navigator: {}, URL, URLSearchParams, WeakMap, Map, setTimeout, queueMicrotask: fn => microtasks.push(fn)
  });
  const emit = (type, target, extra = {}) => {
    const event = { target, button: 0, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    for (const fn of listeners[type] ?? []) { fn(event); if (event.stopped) break; }
    return event;
  };
  return { document, nodes, node, search, hidden, list, optionOne, optionTwo, commandSearch, commandList, emit,
    on(type, fn) { (listeners[type] ??= []).push(fn); },
    removeOption(option) { listOptions = listOptions.filter(candidate => candidate !== option); },
    flush() { while (microtasks.length) microtasks.shift()(); } };
}

test('dynamic options provide combobox listbox keyboard selection and announcements', () => {
  const f = dynamicOptionsFixture();
  f.emit('input', f.search); f.flush();
  assert.equal(f.search.attrs['aria-expanded'], 'true');
  let event = f.emit('keydown', f.search, { key: 'ArrowDown' });
  assert.equal(event.prevented, true);
  assert.equal(f.search.attrs['aria-activedescendant'], f.optionOne.id);
  f.emit('keydown', f.search, { key: 'ArrowDown' });
  assert.equal(f.search.attrs['aria-activedescendant'], f.optionTwo.id);
  f.emit('keydown', f.search, { key: 'ArrowUp' });
  assert.equal(f.search.attrs['aria-activedescendant'], f.optionOne.id);
  f.emit('keydown', f.search, { key: 'Enter' });
  assert.equal(f.hidden.value, 'one');
  assert.equal(f.optionOne.clicked, 1);
  assert.equal(f.optionOne.attrs['aria-selected'], 'true');
  assert.equal(f.optionTwo.attrs['aria-selected'], 'false');
  assert.equal(f.search.attrs['aria-expanded'], 'false');
  assert.equal(f.list.hidden, true);
  assert.match(f.nodes.get('tk-opts-f.actor-status').textContent, /Selected One/);
  f.emit('input', f.search); f.flush(); f.emit('click', f.optionTwo);
  assert.equal(f.hidden.value, 'two');
  assert.equal(f.optionTwo.attrs['aria-selected'], 'true');
  assert.equal(f.search.attrs['aria-expanded'], 'false');
  f.emit('input', f.search); f.flush(); f.emit('keydown', f.search, { key: 'Escape' });
  assert.equal(f.search.attrs['aria-expanded'], 'false');
  assert.equal(f.list.hidden, true);
});
test('dynamic options expose loading and error states through the live status', () => {
  const f = dynamicOptionsFixture();
  f.search.focus();
  f.emit('input', f.search); f.flush();
  f.emit('datastar-fetch', f.search, { detail: { type: 'started', el: f.search } });
  assert.equal(f.list.attrs['aria-busy'], 'true');
  assert.equal(f.search.attrs['aria-expanded'], 'true');
  assert.match(f.nodes.get('tk-opts-f.actor-status').textContent, /Loading options/);
  f.emit('datastar-fetch', f.search, { detail: { type: 'finished', el: f.search } });
  f.flush();
  assert.equal(f.list.attrs['aria-busy'], 'false');
  assert.equal(f.search.attrs['aria-expanded'], 'true');
  f.emit('datastar-fetch', f.search, { detail: { type: 'error', el: f.search } });
  f.emit('datastar-fetch', f.search, { detail: { type: 'finished', el: f.search } });
  assert.equal(f.search.attrs['aria-expanded'], 'false');
  assert.equal(f.list.hidden, true);
  assert.match(f.nodes.get('tk-opts-f.actor-status').textContent, /unavailable/i);
});
test('dynamic option handling ignores the command palette combobox', () => {
  const f = dynamicOptionsFixture();
  f.commandSearch.focus();
  const event = f.emit('keydown', f.commandSearch, { key: 'Escape' });
  assert.equal(event.prevented, undefined);
  assert.equal(f.commandList.hidden, false);
});
test('dynamic options require an explicit active option in a visible ready list', () => {
  const f = dynamicOptionsFixture();
  f.search.focus();
  f.hidden.value = 'seed';
  f.emit('input', f.search); f.flush();
  f.emit('keydown', f.search, { key: 'Enter' });
  assert.equal(f.hidden.value, 'seed');
  assert.equal(f.optionOne.clicked || 0, 0);
  f.list.setAttribute('aria-busy', 'true');
  f.emit('keydown', f.search, { key: 'ArrowDown' });
  assert.equal(f.search.getAttribute('aria-activedescendant'), null);
  f.list.setAttribute('aria-busy', 'false');
  f.list.hidden = true;
  f.search.setAttribute('aria-expanded', 'false');
  f.emit('keydown', f.search, { key: 'Home' });
  assert.equal(f.search.getAttribute('aria-activedescendant'), null);
});
test('dynamic option pointer focus transition keeps the list open until click selection', () => {
  const f = dynamicOptionsFixture();
  f.search.focus();
  f.emit('input', f.search); f.flush();
  // Native focusout precedes the click when a pointer targets a tabindex=-1
  // option. The option must remain in the active list for that click.
  f.emit('focusout', f.search, { relatedTarget: f.optionTwo });
  assert.equal(f.list.hidden, false);
  f.emit('click', f.optionTwo);
  assert.equal(f.hidden.value, 'two');
  assert.equal(f.list.hidden, true);
});
test('dynamic option clicks ignore hidden and busy stale options', () => {
  const f = dynamicOptionsFixture();
  f.hidden.value = 'seed';
  f.search.focus();
  f.emit('input', f.search); f.flush();
  f.list.hidden = true;
  f.search.setAttribute('aria-expanded', 'false');
  f.emit('click', f.optionOne);
  assert.equal(f.hidden.value, 'seed');

  f.list.hidden = false;
  f.search.setAttribute('aria-expanded', 'true');
  f.list.setAttribute('aria-busy', 'true');
  f.emit('click', f.optionTwo);
  assert.equal(f.hidden.value, 'seed');
});
test('dynamic option capture blocks stale Datastar effects but allows one valid effect', () => {
  const f = dynamicOptionsFixture();
  let effects = 0;
  // Models the target listener installed by data-on:click after the document
  // capture guard. It must never run for an option outside the ready list.
  f.on('click', event => {
    if (event.target.matches?.('[role="option"]')) effects += 1;
  });
  f.hidden.value = 'seed';
  f.search.focus();
  f.emit('input', f.search); f.flush();

  f.list.hidden = true;
  f.search.setAttribute('aria-expanded', 'false');
  let event = f.emit('click', f.optionOne);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(effects, 0);

  f.emit('input', f.search); f.flush();
  f.list.setAttribute('aria-busy', 'true');
  event = f.emit('click', f.optionTwo);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(effects, 0);

  f.list.setAttribute('aria-busy', 'false');
  f.emit('input', f.search); f.flush();
  f.removeOption(f.optionOne);
  event = f.emit('click', f.optionOne);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(effects, 0);

  f.emit('input', f.search); f.flush();
  f.emit('click', f.optionTwo);
  assert.equal(effects, 1);
  assert.equal(f.hidden.value, 'two');
});
test('dynamic option dismissal survives delayed Datastar start after Escape or Tab', () => {
  for (const key of ['Escape', 'Tab']) {
    const f = dynamicOptionsFixture();
    f.search.focus();
    f.emit('input', f.search); f.flush();
    f.emit('keydown', f.search, { key });
    f.emit('datastar-fetch', f.search, { detail: { type: 'started', el: f.search } });
    assert.equal(f.list.hidden, true, key);
    assert.equal(f.search.getAttribute('aria-expanded'), 'false', key);
    f.emit('datastar-fetch', f.search, { detail: { type: 'finished', el: f.search } });
    f.flush();
    assert.equal(f.list.hidden, true, key);
    assert.equal(f.search.getAttribute('aria-expanded'), 'false', key);
  }
});
test('dynamic combobox Enter always consumes native submit except for other inputs', () => {
  const runEnter = (f, form) => {
    const event = f.emit('keydown', f.search, { key: 'Enter' });
    if (!event.prevented) f.emit('submit', form);
    return event;
  };
  const assertConsumed = (f, setup) => {
    const form = f.node('parent-form');
    let submits = 0;
    f.on('submit', event => { if (event.target === form) submits += 1; });
    f.search.focus();
    f.emit('input', f.search); f.flush();
    setup(f);
    const event = runEnter(f, form);
    assert.equal(event.prevented, true);
    assert.equal(submits, 0);
    assert.equal(f.optionOne.clicked || 0, 0);
  };

  assertConsumed(dynamicOptionsFixture(), f => f.emit('keydown', f.search, { key: 'Escape' }));
  assertConsumed(dynamicOptionsFixture(), f => f.list.setAttribute('aria-busy', 'true'));
  assertConsumed(dynamicOptionsFixture(), f => {
    f.emit('keydown', f.search, { key: 'Tab' });
    f.list.hidden = false;
    f.search.setAttribute('aria-expanded', 'true');
  });
  assertConsumed(dynamicOptionsFixture(), () => {});

  const ready = dynamicOptionsFixture();
  const readyForm = ready.node('ready-form');
  let readySubmits = 0;
  ready.on('submit', event => { if (event.target === readyForm) readySubmits += 1; });
  ready.search.focus();
  ready.emit('input', ready.search); ready.flush();
  ready.emit('keydown', ready.search, { key: 'ArrowDown' });
  let event = runEnter(ready, readyForm);
  assert.equal(event.prevented, true);
  assert.equal(ready.optionOne.clicked, 1);
  event = runEnter(ready, readyForm);
  assert.equal(event.prevented, true);
  assert.equal(ready.optionOne.clicked, 1);
  assert.equal(readySubmits, 0);

  const plain = dynamicOptionsFixture();
  const plainInput = plain.node('plain-input');
  const plainForm = plain.node('plain-form');
  let nativeSubmits = 0;
  plain.on('submit', event => { if (event.target === plainForm) nativeSubmits += 1; });
  event = plain.emit('keydown', plainInput, { key: 'Enter' });
  if (!event.prevented) plain.emit('submit', plainForm);
  assert.equal(event.prevented, undefined);
  assert.equal(nativeSubmits, 1);
});
test('dynamic option dismissal, focus changes, and replacements survive async completion', () => {
  const f = dynamicOptionsFixture();
  const other = f.node('other');
  f.search.focus();
  f.emit('input', f.search); f.flush();
  f.emit('datastar-fetch', f.search, { detail: { type: 'started', el: f.search } });
  f.emit('keydown', f.search, { key: 'Escape' });
  f.emit('datastar-fetch', f.search, { detail: { type: 'finished', el: f.search } });
  f.flush();
  assert.equal(f.list.hidden, true);
  assert.equal(f.search.getAttribute('aria-expanded'), 'false');

  f.search.focus();
  f.emit('input', f.search); f.flush();
  f.emit('datastar-fetch', f.search, { detail: { type: 'started', el: f.search } });
  f.emit('keydown', f.search, { key: 'Tab' });
  f.emit('datastar-fetch', f.search, { detail: { type: 'finished', el: f.search } });
  f.flush();
  assert.equal(f.list.hidden, true);
  assert.equal(f.search.getAttribute('aria-expanded'), 'false');

  f.search.focus();
  f.emit('input', f.search); f.flush();
  f.emit('keydown', f.search, { key: 'ArrowDown' });
  assert.ok(f.search.getAttribute('aria-activedescendant'));
  f.emit('datastar-fetch', f.search, { detail: { type: 'datastar-patch-elements', el: f.search } });
  assert.equal(f.search.getAttribute('aria-activedescendant'), null);
  f.emit('datastar-fetch', f.search, { detail: { type: 'started', el: f.search } });
  f.search.focus(); other.focus();
  f.emit('datastar-fetch', f.search, { detail: { type: 'error', el: f.search } });
  assert.equal(f.document.activeElement, other);
});
test('Connect activates Settings and focuses its heading without submitting',()=>{
  const f=fixture();const setup=f.node('tk-setup');
  const link=f.node('connect',{attrs:{href:'/app/connectors/provider?tab=settings#tk-setup'}});link.closest=s=>s==='a'?link:null;
  f.emit('click',link);assert.equal(f.nodes.get('tk-panel-settings').hidden,false);assert.equal(f.document.activeElement,setup);
});
test('network and missing-result failures retain result heading and render an alert child',()=>{
  for (const failed of [true,false]) {
    const f=fixture();const heading=f.node('tk-result-label',{textContent:'Result'});
    f.emit('submit',f.form);f.fetch('started');if(failed)f.fetch('error');f.fetch('finished');
    const result=f.nodes.get('tk-test-result');
    assert.equal(result.children[0],heading);
    assert.ok(result.querySelector('[role="alert"]'));
    assert.match(result.querySelector('[role="alert"]').textContent,/tool may have run/i);
    assert.match(result.querySelector('[role="alert"]').textContent,/Check execution logs and provider activity/);
  }
});
test('field transport failure preserves heading while an applied server failure keeps its explanation',()=>{
  for (const serverError of [true,false]) {
    const f=fixture();const heading=f.node('tk-fields-label',{textContent:'Tool input'});
    const fields=f.nodes.get('tk-test-fields');fields.setAttribute('aria-labelledby','tk-fields-label');
    const emit=(type,argsRaw={})=>f.emit('datastar-fetch',f.document,{detail:{type,el:f.account,argsRaw}});
    emit('started');
    let serverAlert;
    if(serverError) {
      serverAlert=f.node('server-alert',{textContent:'Operator must restore configuration.'});serverAlert.setAttribute('role','alert');
      fields.replaceChildren(heading,serverAlert);fields.setAttribute('data-fields-valid','false');
      emit('datastar-patch-elements',{selector:'#tk-test-fields'});
    } else emit('error');
    emit('finished');
    assert.equal(fields.children[0],heading);
    assert.equal(fields.attrs['aria-labelledby'],'tk-fields-label');
    assert.ok(fields.querySelector('[role="alert"]'));
    if(serverError) assert.equal(fields.querySelector('[role="alert"]'),serverAlert);
    assert.equal(f.run.disabled,true);
  }
});
test('an unapplied field patch cannot reuse the preceding error marker',()=>{
  const f=fixture();const fields=f.nodes.get('tk-test-fields');
  const old=f.node('old-alert',{textContent:'Previous failure explanation.'});old.setAttribute('role','alert');
  fields.replaceChildren(old);fields.setAttribute('data-fields-valid','false');
  const emit=(type,argsRaw={})=>f.emit('datastar-fetch',f.document,{detail:{type,el:f.account,argsRaw}});
  emit('started');emit('datastar-patch-elements',{selector:'#tk-test-fields',elements:'malformed'});emit('finished');
  assert.match(fields.querySelector('[role="alert"]').textContent,/could not be loaded/);
  assert.doesNotMatch(fields.textContent,/Previous failure/);
  assert.equal(f.run.disabled,true);
});
