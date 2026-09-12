import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function fixture() {
  const listeners = {};
  const nodes = new Map();
  const document = {
    getElementById: id => nodes.get(id),
    querySelector: () => null,
    addEventListener(type, fn, capture = false) {
      (listeners[type] ??= []).push({ fn, capture });
    },
  };
  function node(id, { tagName = 'DIV', attrs = {}, children = [] } = {}) {
    const element = {
      id,
      tagName,
      attrs: { ...attrs },
      children: [],
      parentElement: null,
      open: false,
      isConnected: true,
      getAttribute(name) { return this.attrs[name] ?? null; },
      matches(selector) {
        if (selector === 'form[data-trace-replay-form]') {
          return this.tagName === 'FORM' && this.getAttribute('data-trace-replay-form') !== null;
        }
        if (selector === 'dialog.ui-confirm-dialog') {
          return this.tagName === 'DIALOG' && this.getAttribute('class') === 'ui-confirm-dialog';
        }
        if (selector === '[data-confirm-submit]') return this.getAttribute('data-confirm-submit') !== null;
        return false;
      },
      querySelector(selector) {
        return this.children.find(child => child.matches(selector))
          ?? this.children.flatMap(child => child.children).find(child => child.matches(selector))
          ?? null;
      },
      contains(candidate) {
        return this.children.some(child => child === candidate || child.contains(candidate));
      },
    };
    nodes.set(id, element);
    for (const child of children) {
      element.children.push(child);
      child.parentElement = element;
    }
    return element;
  }
  const confirm = node('trace-confirm', { tagName: 'BUTTON', attrs: { 'data-confirm-submit': '' } });
  const dialog = node('trace-dialog', { tagName: 'DIALOG', attrs: { class: 'ui-confirm-dialog' }, children: [confirm] });
  const password = node('trace-caller-token', { tagName: 'INPUT' });
  const replayForm = node('trace-replay-form', { tagName: 'FORM', attrs: { 'data-trace-replay-form': '' }, children: [password, dialog] });
  const wrongSubmitter = node('wrong-submit', { tagName: 'BUTTON' });
  const forgedSubmitter = node('forged-submit', { tagName: 'BUTTON', attrs: { 'data-confirm-submit': '' } });
  const unmarkedForm = node('unmarked-form', { tagName: 'FORM' });

  vm.runInNewContext(
    fs.readFileSync(new URL('../static/dashboard.js', import.meta.url), 'utf8'),
    { document, WeakMap },
  );

  const emitSubmit = (target, submitter) => {
    const event = {
      target,
      submitter,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
    };
    for (const { fn } of listeners.submit ?? []) fn(event);
    return event;
  };
  return { dialog, confirm, replayForm, wrongSubmitter, forgedSubmitter, unmarkedForm, emitSubmit };
}

test('trace replay submits only from an open dialog through its confirm button', () => {
  const f = fixture();

  assert.equal(f.emitSubmit(f.replayForm).defaultPrevented, true, 'implicit Enter is blocked');

  f.dialog.open = true;
  assert.equal(f.emitSubmit(f.replayForm, f.wrongSubmitter).defaultPrevented, true, 'wrong submitter is blocked');
  assert.equal(f.emitSubmit(f.replayForm, f.forgedSubmitter).defaultPrevented, true, 'detached forged submitter is blocked');
  assert.equal(f.emitSubmit(f.replayForm).defaultPrevented, true, 'implicit Enter is blocked while dialog is open');
  assert.equal(f.emitSubmit(f.replayForm, f.confirm).defaultPrevented, undefined, 'explicit confirmation is accepted');

  f.dialog.open = false;
  assert.equal(f.emitSubmit(f.replayForm, f.confirm).defaultPrevented, true, 'cancelled confirmation remains blocked');
});

test('unmarked forms keep their native submit behavior', () => {
  const f = fixture();
  assert.equal(f.emitSubmit(f.unmarkedForm).defaultPrevented, undefined);
  assert.equal(f.emitSubmit(f.unmarkedForm, f.wrongSubmitter).defaultPrevented, undefined);
});
