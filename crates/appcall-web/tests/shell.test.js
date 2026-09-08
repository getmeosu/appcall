import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('shell selection uses ink surfaces and rails; compact keyboard navigation reveals labels',()=>{
  const css=fs.readFileSync(new URL('../static/dashboard.css',import.meta.url),'utf8');
  assert.match(css, /nav a\[aria-current="page"\] \{ background: var\(--color-raised\)/);
  assert.match(css, /#cmdk-list a\[data-active\]::before/);
  assert.match(css, /a:focus-visible \.shell-nav-label/);
});

function fixture(script) {
  const nodes = new Map();
  const listeners = {};
  const document = { readyState: 'complete', body: { dataset: {} }, activeElement: null,
    getElementById: id => nodes.get(id), querySelectorAll: () => [nodes.get('opener')],
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  function node(id, attrs = {}) {
    const handlers = {};
    const n = { id, attrs, open: false, isConnected: true, children: [], value: '', textContent: '',
      setAttribute(k,v) { this.attrs[k]=v; }, getAttribute(k) { return this.attrs[k] ?? null; },
      hasAttribute(k) { return k in this.attrs; }, removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(type, fn) { (handlers[type] ??= []).push(fn); },
      emit(type, event={}) { for (const fn of handlers[type] ?? []) fn(event); },
      focus() { document.activeElement=this; }, scrollIntoView() {},
      showModal() { this.open=true; }, close() { this.open=false; this.emit('close'); },
      querySelectorAll() { return this.children; }, querySelector() { return this.children[0]; },
      append(child) { this.children.push(child); child.parentNode=this; },
      insertBefore(child) { this.append(child); },
    };
    nodes.set(id,n); return n;
  }
  const opener=node('opener');opener.focus();
  const dialog=node('cmdk',{hidden:''}); const input=node('cmdk-input');const list=node('cmdk-list');
  const close=node('cmdk-close');node('cmdk-status');
  list.children=[node('overview',{'data-cmd':'Overview',href:'/app'}),node('logs',{'data-cmd':'Logs',href:'/app/logs'})];
  const sidebar=node('dashboard-sidebar');const parent=node('shell');parent.append(sidebar);
  sidebar.children=[node('nav-link')];const toggle=node('nav-toggle');node('nav-close');node('nav-backdrop');node('nav-drawer');
  const media={ matches:true, addEventListener(type, fn) { this.change=fn; } };
  const window={ location:{href:''}, matchMedia:()=>media };
  vm.runInNewContext(fs.readFileSync(new URL(`../static/${script}`,import.meta.url),'utf8'),{document,window,WeakMap});
  const key=(key,target=input,extra={})=>{ const e={key,target,preventDefault(){this.prevented=true;},...extra};for(const fn of listeners.keydown??[])fn(e);return e; };
  return {nodes,document,dialog,input,list,opener,close,window,key,media,toggle};
}
test('palette filters all markers, announces no results and Enter only selects from the search field',()=>{
  const f=fixture('palette.js');f.opener.emit('click');
  assert.equal(f.dialog.open,true);
  assert.equal(f.nodes.get('cmdk-status').textContent,'Overview. 1 of 2 pages.');
  f.key('ArrowDown');
  assert.equal(f.nodes.get('cmdk-status').textContent,'Logs. 2 of 2 pages.');
  f.key('ArrowUp');
  assert.equal(f.nodes.get('cmdk-status').textContent,'Overview. 1 of 2 pages.');
  f.input.value='Logs';f.input.emit('input');
  assert.equal(f.nodes.get('cmdk-status').textContent,'Logs. 1 of 1 pages.');
  assert.equal(f.list.children[0].hasAttribute('data-active'),false);
  assert.equal(f.list.children[0].hasAttribute('hidden'),true);
  f.key('Enter',f.close);assert.equal(f.window.location.href,'');
  f.key('Enter');assert.equal(f.window.location.href,'/app/logs');
  f.input.value='missing';f.input.emit('input');
  assert.equal(f.nodes.get('cmdk-status').textContent,'No matching pages.');
  f.key('Enter');assert.equal(f.window.location.href,'/app/logs');
});
test('palette Escape and native close restore the invoking control',()=>{
  const f=fixture('palette.js');f.opener.emit('click');assert.equal(f.document.activeElement,f.input);
  f.key('Escape');assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.opener);
  f.key('k',f.opener,{ctrlKey:true});f.dialog.close();assert.equal(f.document.activeElement,f.opener);
});
test('mobile drawer focuses navigation and resets on desktop breakpoint',()=>{
  const f=fixture('dashboard.js');f.toggle.focus();f.toggle.emit('click');
  assert.equal(f.nodes.get('nav-drawer').open,true);
  assert.equal(f.document.activeElement,f.nodes.get('nav-link'));
  f.media.matches=false;f.media.change();
  assert.equal(f.nodes.get('nav-drawer').open,false);
  assert.equal(f.toggle.getAttribute('aria-expanded'),'false');
  assert.equal(f.nodes.get('dashboard-sidebar').parentNode,f.nodes.get('shell'));
});
