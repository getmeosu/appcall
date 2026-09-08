(() => {
  const toggle = document.getElementById('nav-toggle');
  const sidebar = document.getElementById('dashboard-sidebar');
  const drawer = document.getElementById('nav-drawer');
  if (!toggle || !drawer || !sidebar) return;
  const home = sidebar.parentNode;
  const sibling = sidebar.nextSibling;
  const mobile = window.matchMedia('(max-width: 767px)');
  const close = () => { if (drawer.open) drawer.close(); };
  drawer.addEventListener('close', () => {
    home.insertBefore(sidebar, sibling);
    toggle.setAttribute('aria-expanded', 'false');
    if (mobile.matches) toggle.focus();
    else sidebar.querySelector('a[aria-current="page"], a')?.focus();
  });
  toggle.addEventListener('click', () => {
    if (!mobile.matches) return;
    if (drawer.open) { close(); return; }
    drawer.append(sidebar);
    drawer.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    sidebar.querySelector('a')?.focus();
  });
  document.getElementById('nav-close').addEventListener('click', close);
  mobile.addEventListener('change', () => { if (!mobile.matches) close(); });
})();

// Delegation survives Datastar replacements. Native dialog supplies the focus
// trap and Escape/cancel behavior; close restores the actual invoking control.
(() => {
  const invokers = new WeakMap();
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-confirm-open]');
    if (trigger) {
      if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return;
      const dialog = document.getElementById(trigger.dataset.confirmOpen);
      if (!dialog?.matches('dialog.ui-confirm-dialog') || dialog.open) return;
      event.preventDefault();
      invokers.set(dialog, trigger);
      dialog.showModal();
      dialog.querySelector('[data-confirm-cancel]')?.focus();
      return;
    }
    const cancel = event.target.closest?.('[data-confirm-cancel]');
    const dialog = cancel?.closest('dialog.ui-confirm-dialog');
    if (dialog?.open) { event.preventDefault(); dialog.close(); }
  });
  document.addEventListener('close', (event) => {
    const trigger = invokers.get(event.target);
    if (trigger?.isConnected) trigger.focus();
    invokers.delete(event.target);
  }, true);
})();

// Keep the OAuth consent preview local; only image URLs with an HTTPS origin
// are ever assigned. User strings are rendered through textContent.
const brandingName = document.getElementById('wl-name');
const brandingLogo = document.getElementById('wl-logo');
const brandingColor = document.getElementById('wl-color');
if (brandingName && brandingLogo && brandingColor) {
  const initial = document.getElementById('wl-logo-initial');
  const image = document.getElementById('wl-logo-img');
  brandingName.addEventListener('input', () => {
    const name = brandingName.value.trim() || 'appcall';
    document.getElementById('wl-preview-name').textContent = name;
    document.getElementById('wl-badge-name').textContent = name;
    initial.textContent = Array.from(name)[0].toUpperCase();
  });
  brandingLogo.addEventListener('input', () => {
    let safe = '';
    try { const url = new URL(brandingLogo.value); if (url.protocol === 'https:' && !url.username && !url.password) safe = url.href; } catch {}
    if (safe) image.src = safe; else image.removeAttribute('src');
    image.style.display = safe ? 'block' : 'none';
    initial.style.display = safe ? 'none' : 'flex';
  });
  image.addEventListener('error', () => { image.style.display = 'none'; initial.style.display = 'flex'; });
  brandingColor.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(brandingColor.value)) initial.style.backgroundColor = brandingColor.value; });
}

// Catalog request lifecycle is independent of the connector detail page. The
// existing Datastar form owns the POST and FormData snapshot; this only guards
// submissions and presents applied results or an uncertain receipt.
(() => {
  const form = document.getElementById('toolkit-request-form');
  if (!form) return;
  const result = () => document.getElementById('toolkit-request-result');
  const button = form.querySelector('button[type="submit"]');
  let pending = null;
  document.addEventListener('submit', event => {
    if (event.target !== form) return;
    if (pending || !form.checkValidity()) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    // Capture phase guards keyboard and repeated submissions before Datastar's
    // target listener. Leave all controls available for its synchronous snapshot.
    const request = { disabled: button?.disabled, labels: new Map() };
    pending = request;
    form.setAttribute('aria-busy', 'true');
    const target = result();
    if (target) {
      target.removeAttribute('data-request-state');
      target.textContent = 'Submitting connector request…';
      target.setAttribute('aria-busy', 'true');
    }
    for (const [element, attribute, value] of [
      [button, 'aria-busy', 'true'],
      [button?.querySelector('.ui-button-idle'), 'aria-hidden', 'true'],
      [button?.querySelector('.ui-button-working'), 'aria-hidden', 'false'],
    ]) {
      if (!element) continue;
      request.labels.set(element, { attribute, previous: element.getAttribute(attribute) });
      element.setAttribute(attribute, value);
    }
  }, true);
  document.addEventListener('datastar-fetch', event => {
    const { el, type } = event.detail || {};
    if (el !== form || !pending) return;
    if (type === 'started') {
      // Datastar takes FormData immediately after this synchronous event. A
      // capture-submit microtask would be too early between native listeners.
      const request = pending;
      queueMicrotask(() => { if (pending === request && button) button.disabled = true; });
      return;
    }
    if (type !== 'finished') return;
    const target = result();
    // Requery after replacement. Event arguments describe an intended patch,
    // not proof that the renderer actually applied a current terminal result.
    if (target) {
      if (!['success', 'error'].includes(target.getAttribute('data-request-state'))) {
        const recovery = document.getElementById('toolkit-request-recovery');
        target.replaceChildren(recovery.content.cloneNode(true));
      }
      target.setAttribute('aria-busy', 'false');
    }
    form.setAttribute('aria-busy', 'false');
    for (const [element, { attribute, previous }] of pending.labels) {
      if (!element.isConnected) continue;
      if (previous === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, previous);
    }
    if (button?.isConnected) button.disabled = pending.disabled;
    pending = null;
  });
})();

// Connector navigation enhances native GET links. Executions remain owned by
// the form's Datastar POST; this module never fetches or retries an operation.
(() => {
  const root = document.getElementById('tk-detail');
  if (!root) return;
  const get = id => document.getElementById(id);
  const tabs = Array.from(root.querySelectorAll('#tk-tabs a'));
  const rail = Array.from(root.querySelectorAll('.tk-tool-item a'));
  let pending = null;
  let confirmed = null;
  let fieldsRequest = null;
  let fieldsReady = get('tk-test-fields')?.getAttribute('data-fields-valid') !== 'false';
  const announce = text => { const status = get('tk-status'); if (status) status.textContent = text; };
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const runButton = () => get('tk-run-control')?.querySelector('button');
  const executionButtons = submitter => [runButton(), submitter].filter((button, index, buttons) => button && buttons.indexOf(button) === index);
  // Both label spans stay in the shared grid, reserving the working text width
  // before execution begins. Visibility changes never replace button content.
  for (const button of executionButtons(get('tk-run-confirm')?.querySelector('[data-confirm-submit]'))) {
    const working = button.querySelector('.ui-button-working');
    if (working) working.textContent = 'Running…';
  }
  function showWorking(request) {
    for (const button of request.buttons) {
      for (const [element, attribute, value] of [
        [button, 'aria-busy', 'true'],
        [button.querySelector('.ui-button-idle'), 'aria-hidden', 'true'],
        [button.querySelector('.ui-button-working'), 'aria-hidden', 'false'],
      ]) {
        if (!element || request.labels.has(element)) continue;
        request.labels.set(element, { attribute, previous: element.getAttribute(attribute) });
        element.setAttribute(attribute, value);
      }
    }
  }
  function restoreLabels(request) {
    for (const [element, { attribute, previous }] of request.labels) {
      if (!element.isConnected) continue;
      if (previous === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, previous);
    }
  }
  const regionMessage = (region, headingId, label, message, error) => {
    const heading = get(headingId);
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    if (error) paragraph.setAttribute('role', 'alert');
    region.replaceChildren(...(heading ? [heading, paragraph] : [paragraph]));
    if (!heading) { region.removeAttribute('aria-labelledby'); region.setAttribute('aria-label', label); }
  };
  const resultMessage = (message, error = false) => {
    const result = get('tk-test-result');
    if (!result) return;
    regionMessage(result, 'tk-result-label', 'Result', message, error);
    result.removeAttribute('data-result-state');
  };
  const account = () => {
    const select = get('tk-connection');
    return Array.from(select?.options || []).some(o => !o.disabled && o.value === select.value) ? select.value : '';
  };
  const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const segment = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  function syncSelection() {
    const connection = account();
    get('tk-selection-connection').value = connection;
    for (const a of root.querySelectorAll('a')) {
      const url = new URL(a.getAttribute('href'), window.location.href);
      if (url.pathname !== '/app/connectors/' + root.dataset.toolkitKey) continue;
      const clean = new URLSearchParams();
      for (const key of ['action', 'tab']) if (url.searchParams.get(key)) clean.set(key, url.searchParams.get(key));
      if (connection) clean.set('connectionId', connection);
      a.setAttribute('href', url.pathname + '?' + clean + url.hash);
    }
    const data = get('tk-code-data');
    if (data && get('tk-code-example')) {
      try {
        const sample = JSON.parse(data.content.textContent);
        const url = 'https://YOUR_APPCALL_ORIGIN/v1/connections/' + segment(connection || 'YOUR_CONNECTION_ID') + '/actions/' + segment(sample.action);
        get('tk-code-example').textContent = 'curl --request POST ' + quote(url) + ' \\\n  --header ' + quote('X-API-Key: YOUR_API_KEY') + ' \\\n  --header ' + quote('X-External-Account-Id: YOUR_EXTERNAL_ACCOUNT_ID') + ' \\\n  --header ' + quote('Content-Type: application/json') + ' \\\n  --data ' + quote(JSON.stringify(sample.body));
      } catch { announce('Code sample unavailable.'); }
    }
    const description = get('tk-run-confirm-body');
    if (description) description.textContent = 'Run ' + get('tk-selected-action').value + ' as ' + (connection || 'no active account') + '? This operation is marked destructive and may permanently change data.';
  }
  function runAvailability() {
    const disabled = !!pending || !!fieldsRequest || !fieldsReady || !account() || !get('tk-selected-action').value;
    for (const button of get('tk-run-control')?.querySelectorAll('button') || []) button.disabled = disabled;
  }
  function activate(tab, focus = false) {
    for (const a of tabs) {
      const selected = a === tab;
      const wrapper = a.parentElement;
      a.setAttribute('role', 'tab');
      a.setAttribute('id', wrapper.id + '-link');
      a.setAttribute('aria-controls', 'tk-panel-' + wrapper.dataset.tab);
      a.setAttribute('aria-selected', String(selected));
      a.setAttribute('tabindex', selected ? '0' : '-1');
      wrapper.dataset.selected = String(selected);
      const panel = get('tk-panel-' + wrapper.dataset.tab);
      panel.hidden = !selected;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', wrapper.id + '-link');
    }
    if (focus) tab.focus();
  }
  get('tk-tabs').setAttribute('role', 'tablist');
  activate(tabs.find(a => a.parentElement.dataset.selected === 'true') || tabs[0]);
  syncSelection();
  document.addEventListener('keydown', event => {
    const tab = event.target.closest?.('#tk-tabs a');
    const tool = event.target.closest?.('.tk-tool-item a');
    const list = tab ? tabs : tool ? rail.filter(a => !a.closest('.tk-tool-item')?.hidden) : [];
    const index = list.indexOf(tab || tool);
    if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = tab ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    let next;
    if (event.key === keys[0]) next = (index + list.length - 1) % list.length;
    if (event.key === keys[1]) next = (index + 1) % list.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = list.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    if (tab) activate(list[next], true); else list[next].focus();
  });
  document.addEventListener('click', event => {
    const confirm = event.target.closest?.('#tk-run-confirm [data-confirm-submit]');
    if (confirm && get('tk-run-confirm')?.open && !pending && fieldsReady && !fieldsRequest) {
      confirmed = confirm;
      // Native click activation may run after a microtask checkpoint; expire
      // after this task so the browser's default submit can consume the token.
      setTimeout(() => { confirmed = null; }, 0);
    }
    const link = event.target.closest?.('.tk-tool-item a');
    if (link && pending) { stop(event); return; }
    const tab = event.target.closest?.('#tk-tabs a');
    if (tab && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); activate(tab); return;
    }
    const anchor = event.target.closest?.('a');
    if (anchor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      const url = new URL(anchor.getAttribute('href'), window.location.href);
      if (url.pathname === '/app/connectors/' + root.dataset.toolkitKey && url.hash === '#tk-setup') {
        event.preventDefault(); activate(tabs.find(a => a.parentElement.dataset.tab === 'settings')); get('tk-setup')?.focus(); return;
      }
    }
    if (event.target.closest?.('#tk-copy-json button')) {
      event.preventDefault();
      const output = get('tk-output-json');
      if (!output) return;
      (async () => {
        try { await navigator.clipboard.writeText(output.textContent); announce('JSON copied.'); }
        catch { announce('Could not copy JSON. Select the output and copy it manually.'); }
      })();
    }
  }, true);
  document.addEventListener('input', event => {
    if (event.target.id !== 'tk-tool-filter') return;
    const query = event.target.value.trim().toLowerCase();
    let count = 0;
    for (const link of rail) {
      const item = link.closest('.tk-tool-item');
      item.hidden = !item.textContent.toLowerCase().includes(query);
      if (!item.hidden) count++;
    }
    for (const group of root.querySelectorAll('.tk-tool-group')) {
      const items = Array.from(group.querySelectorAll('.tk-tool-item'));
      group.hidden = items.length > 0 && items.every(item => item.hidden);
    }
    announce(count ? count + (count === 1 ? ' tool shown.' : ' tools shown.') : 'No matching tools.');
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'tk-connection' && !pending) {
      syncSelection(); runAvailability();
      resultMessage('Account changed. Run the tool to see a result for this account.');
    }
    if (event.target.id === 'tk-action' && !pending) {
      syncSelection(); get('tk-tool-selector').requestSubmit();
    }
  });
  document.addEventListener('submit', event => {
    if (event.target.id === 'tk-tool-selector') { if (pending) stop(event); else syncSelection(); return; }
    if (event.target.id !== 'tk-run-form') return;
    const form = event.target;
    if (pending || fieldsRequest || !fieldsReady || !form.checkValidity()) { stop(event); if (!pending && fieldsReady) form.reportValidity(); return; }
    const dialog = get('tk-run-confirm');
    if (dialog && (!dialog.open || !confirmed || event.submitter !== confirmed)) {
      stop(event); get('tk-run-control').querySelector('[data-confirm-open]')?.click(); return;
    }
    if (!account() || !get('tk-selected-action').value) { stop(event); return; }
    confirmed = null;
    if (dialog?.open) dialog.close();
    pending = { form, locked: new Map(), patch: false, failed: false, buttons: executionButtons(event.submitter), labels: new Map() };
  }, true);
  document.addEventListener('datastar-fetch', event => {
    const { type, el, argsRaw = {} } = event.detail;
    if (['tk-connection', 'tk-action'].includes(el?.id)) {
      if (type === 'started') {
        fieldsRequest = { el, patch: false, failed: false, action: get('tk-selected-action').value, connection: account() };
        fieldsReady = false;
        get('tk-test-fields')?.setAttribute('aria-busy', 'true');
        get('tk-test-fields')?.removeAttribute('data-fields-valid');
        const request = fieldsRequest;
        queueMicrotask(() => { if (fieldsRequest === request) runAvailability(); });
      } else if (fieldsRequest?.el === el) {
        if (type === 'datastar-patch-elements') fieldsRequest.patch ||= argsRaw.selector === '#tk-test-fields' || /\bid=["']tk-test-fields["']/.test(argsRaw.elements || '');
        if (['error', 'retrying', 'retries-failed'].includes(type)) fieldsRequest.failed = true;
        if (type === 'finished') {
          fieldsReady = fieldsRequest.patch && !fieldsRequest.failed && get('tk-test-fields')?.getAttribute('data-fields-valid') === 'true' && fieldsRequest.action === get('tk-selected-action').value && fieldsRequest.connection === account();
          const serverFailure = fieldsRequest.patch && !fieldsRequest.failed && get('tk-test-fields')?.getAttribute('data-fields-valid') === 'false' && get('tk-test-fields')?.querySelector('[role="alert"]');
          fieldsRequest = null;
          const fields = get('tk-test-fields');
          fields?.setAttribute('aria-busy', 'false');
          if (!fieldsReady && fields && !serverFailure) {
            regionMessage(fields, 'tk-fields-label', 'Tool input', 'Tool inputs could not be loaded. Select the tool again.', true);
          }
          runAvailability();
        }
      }
      return;
    }
    if (el?.id !== 'tk-run-form' || !pending || pending.form !== el) return;
    const request = pending;
    if (type === 'started') {
      showWorking(request);
      get('tk-test-result')?.setAttribute('aria-busy', 'true');
      resultMessage('Running tool…');
      announce('Running tool…');
      // Vendored Datastar snapshots FormData synchronously after started. A
      // microtask locks only after that snapshot and cannot outlive finished.
      queueMicrotask(() => {
        if (pending !== request) return;
        for (const control of root.querySelectorAll('input, select, textarea, button')) {
          request.locked.set(control, control.disabled); control.disabled = true;
        }
        for (const link of rail) link.setAttribute('aria-disabled', 'true');
      });
    } else if (type === 'datastar-patch-elements') {
      request.patch ||= argsRaw.selector === '#tk-test-result' || /\bid=["']tk-test-result["']/.test(argsRaw.elements || '');
    } else if (['error', 'retrying', 'retries-failed'].includes(type)) {
      request.failed = true;
    } else if (type === 'finished') {
      restoreLabels(request);
      for (const [control, disabled] of request.locked) if (control.isConnected) control.disabled = disabled;
      for (const link of rail) link.removeAttribute('aria-disabled');
      get('tk-test-result')?.setAttribute('aria-busy', 'false');
      const resultState = get('tk-test-result')?.getAttribute('data-result-state');
      const applied = request.patch && ['success', 'error'].includes(resultState);
      const uncertain = request.failed || !applied;
      const message = uncertain ? 'No result received. The tool may have run. Check execution logs and provider activity before running again.' : resultState === 'error' ? 'Tool request failed. Review the result details before another run.' : 'Tool request completed.';
      if (uncertain) resultMessage(message, true);
      announce(message);
      pending = null;
    }
  });
})();
