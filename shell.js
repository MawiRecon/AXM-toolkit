/* =====================================================================
   AXM-toolkit shell — sidebar rendering + hash routing
   ---------------------------------------------------------------------
   ADD A NEW TOOL: drop its folder under tools/<id>/index.html, then add
   one entry to the TOOLS array below. Nav + routing update automatically.
   ===================================================================== */
const TOOLS = [
  {
    id: 'io-autofiller',
    name: 'IO Autofiller',
    desc: 'Fill Insertion Orders from WorkForms',
    src: 'tools/io-autofiller/index.html',
    // document / auto-fill
    icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>'
  },
  {
    id: 'primary-tracker',
    name: 'Primary Tracker',
    desc: '2026 primary calendar & alerts',
    src: 'tools/primary-tracker/index.html',
    // calendar
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 15h.01"/><path d="M12 15h.01"/><path d="M16 15h.01"/></svg>'
  },
  {
    id: 'ax-billing',
    name: 'Billing Tracker',
    desc: 'Campaign billing & rebate ledger',
    src: 'tools/ax-billing/index.html',
    // ledger / dollar-table
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 4v16"/><path d="M14 13h2"/><path d="M14 16h2"/></svg>'
  },
  {
    id: 'l2-audience',
    name: 'L2 Audience',
    desc: 'Build voter audiences in L2',
    src: 'tools/l2-audience/index.html',
    // target / audience
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/></svg>'
  }
];

const nav       = document.getElementById('nav');
const frame     = document.getElementById('toolFrame');
const openNew   = document.getElementById('openNew');
const collapseBtn = document.getElementById('collapseBtn');

/* ---- render sidebar nav from the registry ---- */
const navLabel = document.createElement('div');
navLabel.className = 'nav-label';
navLabel.textContent = 'Tools';
nav.appendChild(navLabel);

const links = {};
for (const t of TOOLS) {
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.href = '#' + t.id;
  a.title = t.name;
  a.innerHTML =
    `<span class="ico">${t.icon}</span>` +
    `<span class="txt"><span class="t">${t.name}</span><span class="d">${t.desc}</span></span>`;
  nav.appendChild(a);
  links[t.id] = a;
}

/* ---- routing ---- */
function currentTool() {
  const id = location.hash.replace(/^#/, '');
  return TOOLS.find(t => t.id === id) || TOOLS[0];
}

/* Read the ?v= from our own <script src="shell.js?v=X"> and append it to every
   iframe/tool URL. Bumping ?v= in index.html cascades a cache-bust to all tools
   so future updates propagate without users having to clear cache. */
const V = (function(){
  try { return new URL(document.currentScript.src).searchParams.get('v') || ''; }
  catch(e){ return ''; }
})();
function busted(src){ return V ? (src + (src.includes('?')?'&':'?') + 'v=' + V) : src; }

function activate(tool) {
  // swap iframe only if the target actually changed (avoids reload flicker)
  const target = busted(tool.src);
  const abs = new URL(target, location.href).href;
  if (frame.src !== abs) frame.src = target;

  openNew.href = busted(tool.src);   // the sidebar "Open in new tab" points at the active tool

  for (const id in links) links[id].classList.toggle('active', id === tool.id);
  document.title = tool.name + ' · AXM Toolkit';
}

window.addEventListener('hashchange', () => activate(currentTool()));

/* ---- sidebar collapse (persisted) ---- */
if (localStorage.getItem('axm-sidebar-collapsed') === '1') {
  document.body.classList.add('collapsed');
}
collapseBtn.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('collapsed');
  localStorage.setItem('axm-sidebar-collapsed', collapsed ? '1' : '0');
});

/* ---- boot ---- */
if (!location.hash) location.replace('#' + TOOLS[0].id);
activate(currentTool());
