(() => {
  const dialog = document.getElementById('logs-inspector');
  if (!dialog || typeof dialog.show !== 'function' || typeof dialog.showModal !== 'function') return;
  const result = document.getElementById('logs-inspector-result');
  const closeForm = document.getElementById('logs-inspector-close');
  const full = document.getElementById('logs-inspector-full').querySelector('a');
  const login = document.getElementById('logs-inspector-login');
  const narrow = window.matchMedia('(max-width: 1100px)');
  let generation = 0, controller, pendingHref, invoker;

  function restoreFocus() {
    const target = invoker?.isConnected ? invoker : document.getElementById('logs-heading');
    target?.focus();
  }
  function clearCurrent() {
    invoker?.closest('[data-log-row]')?.removeAttribute('data-inspected');
    invoker?.removeAttribute('aria-current');
    invoker?.removeAttribute('aria-controls');
  }
  function invalidate() {
    generation += 1;
    controller?.abort();
    pendingHref = null;
  }
  function close() {
    invalidate();
    clearCurrent();
    if (dialog.open) dialog.close();
    restoreFocus();
  }
  closeForm.addEventListener('submit', event => { event.preventDefault(); close(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    // Native close events are queued. Resizing or selecting another run may have
    // already reopened this dialog by the time an earlier event is delivered.
    if (dialog.open) return;
    invalidate();
    clearCurrent();
    restoreFocus();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !dialog.open || narrow.matches || event.defaultPrevented) return;
    if (document.querySelector('dialog:modal') || document.querySelector('dialog.ui-confirm-dialog[open]')) return;
    event.preventDefault();
    close();
  });
  function reconcileMode() {
    if (!dialog.open || dialog.matches(':modal') === narrow.matches) return;
    // A confirmation or palette keeps ownership of the top layer until it
    // closes. Reconcile from current media state, never a queued old width.
    if ([...document.querySelectorAll('dialog:modal')].some(modal => modal !== dialog)) return;
    const focused = document.activeElement;
    dialog.close();
    if (narrow.matches) dialog.showModal(); else dialog.show();
    focused?.focus();
  }
  narrow.addEventListener('change', reconcileMode);
  document.addEventListener('close', reconcileMode, true);

  function traceURL(anchor) {
    if (!anchor || anchor.hasAttribute('download') || anchor.hasAttribute('target')) return null;
    const href = anchor.getAttribute('href');
    if (!href || !/^\/app\/logs\/[A-Za-z0-9_.-]{1,256}$/.test(href)) return null;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== href) return null;
    url.searchParams.set('view', 'drawer');
    return url;
  }
  function fail(status) {
    const messages = {
      401: 'Sign in to inspect this trace.',
      403: 'You do not have access to this trace. Open another recorded run.',
      503: 'Trace details are temporarily unavailable. Try again later or open the full trace.',
    };
    result.replaceChildren();
    result.setAttribute('role', 'alert');
    result.textContent = messages[status] || 'Unable to load this trace. Try again or open the full trace.';
    login.hidden = status !== 401;
  }
  async function load(url, token, signal) {
    const current = () => generation === token && dialog.open;
    try {
      const response = await fetch(url.href, { method: 'GET', credentials: 'same-origin', redirect: 'error', signal });
      if (!current()) return;
      if (response.status !== 200) { fail(response.status); return; }
      if (response.redirected || response.url !== url.href || !/^text\/html(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) throw Error('Invalid trace response');
      const html = await response.text();
      if (!current()) return;
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const root = parsed.body.querySelector('#trace-content');
      const requestId = url.pathname.slice('/app/logs/'.length);
      if (parsed.body.children.length !== 1 || parsed.body.children[0] !== root || root.getAttribute('data-request-id') !== requestId || !root.querySelector('#trace-title')) throw Error('Invalid trace fragment');
      // Only the authenticated, marked server fragment is eligible for insertion.
      // Reject active embedded resources rather than allowing response HTML to run.
      if (root.querySelector('script, iframe, object, embed, link, style, base, meta')) throw Error('Active trace fragment');
      result.replaceChildren(root);
      root.querySelector('#trace-title').focus();
    } catch (_) {
      if (current()) fail(0);
    } finally {
      if (current()) { result.setAttribute('aria-busy', 'false'); pendingHref = null; }
    }
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
    const row = event.target.closest('[data-log-row]');
    if (!row) return;
    const anchor = row.querySelector('a[href]');
    const interactive = event.target.closest('a, button, input, select, textarea, label, summary, [contenteditable], [role="button"]');
    if (interactive && interactive !== anchor) return;
    const url = traceURL(anchor);
    if (!url) return;
    event.preventDefault();
    if (dialog.open && pendingHref === url.href) return;
    invalidate();
    clearCurrent();
    invoker = anchor;
    row.setAttribute('data-inspected', '');
    anchor.setAttribute('aria-current', 'true');
    anchor.setAttribute('aria-controls', 'logs-inspector');
    controller = new AbortController();
    pendingHref = url.href;
    result.replaceChildren();
    result.removeAttribute('role');
    result.textContent = 'Loading trace…';
    result.setAttribute('aria-busy', 'true');
    login.hidden = true;
    full.setAttribute('href', url.pathname);
    if (!dialog.open) { if (narrow.matches) dialog.showModal(); else dialog.show(); }
    closeForm.querySelector('button').focus();
    load(url, generation, controller.signal);
  });
})();
