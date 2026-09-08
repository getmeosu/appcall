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
