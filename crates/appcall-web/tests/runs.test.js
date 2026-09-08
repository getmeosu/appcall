import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function fixture() {
  const listeners = {};
  const windowListeners = {};
  const microtasks = [];
  const nodes = new Map();
  const node = (id, extra = {}) => {
    const n = {
      id,
      attrs: {},
      disabled: false,
      hidden: false,
      isConnected: true,
      textContent: '',
      setAttribute(key, value) { this.attrs[key] = String(value); },
      getAttribute(key) { return this.attrs[key] ?? null; },
      removeAttribute(key) { delete this.attrs[key]; },
      ...extra,
    };
    nodes.set(id, n);
    return n;
  };
  const runButton = node('run-button');
  const unrelatedButton = node('filter-button');
  const page = node('runs-page', {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-runs-control] button');
      return [runButton];
    },
  });
  const status = node('runs-live-status');
  const reload = node('runs-reload', { href: '/app/runs' });
  const recovery = node('runs-recovery', {
    hidden: true,
    querySelector: selector => selector === '#runs-reload' ? reload : null,
  });
  const form = node('run-form', {
    action: 'https://appcall.test/app/runs/run_1/cancel',
    closest: selector => selector === 'form' ? form : null,
  });
  const document = {
    querySelector: selector => selector === '[data-runs-page]' ? page : null,
    getElementById: id => nodes.get(id),
    addEventListener(type, listener) { (listeners[type] ??= []).push(listener); },
  };
  const window = {
    addEventListener(type, listener) { (windowListeners[type] ??= []).push(listener); },
  };
  vm.runInNewContext(
    fs.readFileSync(new URL('../static/dashboard.js', import.meta.url), 'utf8'),
    { document, window, WeakMap, Map, queueMicrotask: fn => microtasks.push(fn) },
  );
  const emit = (type, target, extra = {}) => {
    const event = {
      target,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...extra,
    };
    for (const listener of listeners[type] ?? []) listener(event);
    return event;
  };
  const emitWindow = (type, extra = {}) => {
    const event = { ...extra };
    for (const listener of windowListeners[type] ?? []) listener(event);
  };
  return {
    page,
    form,
    runButton,
    unrelatedButton,
    status,
    recovery,
    reload,
    emit,
    emitWindow,
    flush() { while (microtasks.length) microtasks.shift()(); },
  };
}

test('uncertain Runs navigation keeps native reload recovery and only fences mutations', () => {
  const f = fixture();
  f.emit('submit', f.form);

  assert.equal(f.runButton.disabled, true);
  assert.equal(f.unrelatedButton.disabled, false);
  assert.equal(f.recovery.hidden, false);
  assert.match(f.status.textContent, /Applying run control/);
  assert.equal(f.reload.href, '/app/runs');
  assert.equal(new URL(f.reload.href, 'https://appcall.test').origin, 'https://appcall.test');

  // navStop/cancelledsubmit is not guaranteed to fire. Recovery is already
  // visible, and no write is silently re-enabled while the result is unknown.
  f.emitWindow('pagehide', { persisted: false });
  assert.match(f.status.textContent, /outcome is unknown/);
  assert.equal(f.runButton.disabled, true);
  assert.equal(f.unrelatedButton.disabled, false);

  f.emitWindow('pageshow', { persisted: true });
  assert.match(f.status.textContent, /Reload Runs status/);
  assert.equal(f.runButton.disabled, true);
  assert.equal(f.reload.href, '/app/runs');
  f.flush();
  assert.equal(f.runButton.disabled, true);
});
