// Native modal dialogs provide background inertness and keyboard containment.
(() => {
  const ready = (fn) => document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn);
  ready(() => {
    const dialog = document.getElementById('cmdk');
    if (!dialog) return;
    const input = document.getElementById('cmdk-input');
    const list = document.getElementById('cmdk-list');
    const status = document.getElementById('cmdk-status');
    const items = Array.from(list.querySelectorAll('[data-cmd]'));
    let active = -1;
    let invoker = null;
    const visible = () => items.filter(item => !item.hasAttribute('hidden'));
    function setActive(index) {
      items.forEach(item => item.removeAttribute('data-active'));
      const choices = visible();
      active = choices.length ? (index + choices.length) % choices.length : -1;
      if (active >= 0) {
        choices[active].setAttribute('data-active', '');
        choices[active].scrollIntoView({ block: 'nearest' });
        status.textContent = `${choices[active].getAttribute('data-cmd')}. ${active + 1} of ${choices.length} pages.`;
      } else {
        status.textContent = 'No matching pages.';
      }
    }
    function filter(query) {
      const search = query.trim().toLowerCase();
      items.forEach(item => {
        const matches = (item.getAttribute('data-cmd') || '').toLowerCase().includes(search);
        if (matches) item.removeAttribute('hidden');
        else item.setAttribute('hidden', '');
      });
      setActive(0);
    }
    function open() {
      if (dialog.open || document.getElementById('nav-drawer')?.open) return;
      invoker = document.activeElement;
      input.value = '';
      dialog.showModal();
      filter('');
      input.focus();
    }
    function close() { if (dialog.open) dialog.close(); }
    dialog.addEventListener('close', () => {
      if (invoker?.isConnected) invoker.focus();
      invoker = null;
    });
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.open) close(); else open();
        return;
      }
      if (!dialog.open) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      // A focused link or Close button keeps its own native Enter behavior.
      if (event.target !== input) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = visible()[active];
        if (selected) window.location.href = selected.getAttribute('href');
      }
    });
    input.addEventListener('input', () => filter(input.value));
    document.getElementById('cmdk-close').addEventListener('click', close);
    document.querySelectorAll('[data-cmdk-open]').forEach(button => button.addEventListener('click', open));
  });
})();
