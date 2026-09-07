(() => {
  const toggle = document.getElementById('nav-toggle');
  const backdrop = document.getElementById('nav-backdrop');
  const sidebar = document.getElementById('dashboard-sidebar');
  if (!toggle || !backdrop || !sidebar) return;
  const close = () => { delete document.body.dataset.navigation; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); };
  toggle.addEventListener('click', () => {
    if (document.body.dataset.navigation === 'open') { close(); return; }
    document.body.dataset.navigation = 'open';
    toggle.setAttribute('aria-expanded', 'true');
    sidebar.querySelector('a')?.focus();
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.dataset.navigation === 'open') close();
  });
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
