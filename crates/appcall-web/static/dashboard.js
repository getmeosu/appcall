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
