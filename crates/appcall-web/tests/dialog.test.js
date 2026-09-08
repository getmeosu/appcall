import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function fixture() {
  const listeners = {};
  const nodes = new Map();
  const document = { getElementById: id => nodes.get(id), addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
  vm.runInNewContext(fs.readFileSync(new URL('../static/dashboard.js', import.meta.url), 'utf8'), { document, WeakMap });
  const emit = (type, target) => { const event = { target, preventDefault() { this.prevented = true; } }; for (const fn of listeners[type] ?? []) fn(event); return event; };
  return { nodes, emit };
}
function controls(id) {
  const cancel = { focused: false, focus() { this.focused = true; } };
  const dialog = { tagName: 'DIALOG', open: false, showModal() { this.open = true; }, close() { this.open = false; }, querySelector: () => cancel, matches: s => s === 'dialog.ui-confirm-dialog' };
  const trigger = { disabled: false, isConnected: true, dataset: { confirmOpen: id }, focused: false, getAttribute: () => null, focus() { this.focused = true; }, closest: s => s === '[data-confirm-open]' ? trigger : null };
  const cancelTarget = { closest: s => s === '[data-confirm-cancel]' ? { closest: () => dialog } : null };
  return { dialog, trigger, cancel, cancelTarget };
}
test('delegated dialogs support later replacements, focus Cancel, close and restore focus', () => {
  const f = fixture();
  for (let i=0;i<2;i++) {
    const c=controls('delete');f.nodes.set('delete',c.dialog);
    f.emit('click',c.trigger);assert.equal(c.dialog.open,true);assert.equal(c.cancel.focused,true);
    f.emit('click',c.cancelTarget);assert.equal(c.dialog.open,false);
    f.emit('close',c.dialog);assert.equal(c.trigger.focused,true);
  }
});
test('Escape uses native cancel and restores focus on close; disabled/missing triggers do nothing', () => {
  const f=fixture();const c=controls('delete');f.nodes.set('delete',c.dialog);
  c.trigger.disabled=true;f.emit('click',c.trigger);assert.equal(c.dialog.open,false);
  c.trigger.disabled=false;f.emit('click',c.trigger);
  const event=f.emit('cancel',c.dialog);assert.equal(event.prevented,undefined);
  c.dialog.close();f.emit('close',c.dialog);assert.equal(c.trigger.focused,true);
  f.nodes.delete('delete');assert.doesNotThrow(()=>f.emit('click',c.trigger));
});
