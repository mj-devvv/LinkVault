/* LinkVault — main.js: router, views, actions. All data access goes through data.js (auth, repo). */
import './styles.css';
import { configured, enableLocal, auth, repo, prefs, meta } from './data.js';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const root = $('#root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { // Lucide-style paths
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', chevron: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const normUrl = raw => {
  let v = String(raw || '').trim(); if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { const u = new URL(v); return u.hostname.includes('.') ? u.href : null; } catch { return null; }
};
const byId = (arr, id) => arr.find(x => x.id === id);
const byDate = (a, b) => b.created_at.localeCompare(a.created_at);
const pos = x => x.position ?? Date.parse(x.created_at);
const path = () => location.pathname.replace(/\/$/, '') || '/';
function toast(m, bad) {
  const t = document.createElement('div'); t.className = 'toast glass' + (bad ? ' bad' : ''); t.textContent = m;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3500);
}

/* ---------- State ---------- */
const S = { user: null, loaded: false, ws: [], fo: [], bm: [], sort: 'new', lastWs: null };
async function load() {
  try { [S.ws, S.fo, S.bm] = await Promise.all(['workspaces', 'folders', 'bookmarks'].map(t => repo.list(t))); S.loaded = true; }
  catch (e) { toast(e.message || 'Could not load your data', true); }
}
const render = () => { if (path().startsWith('/app') && S.user) shell(path()); };
const refresh = async () => { await load(); render(); };
/** Runs a data mutation, then reloads and re-renders; surfaces errors as toasts. */
const run = async (fn, msg) => { try { await fn(); await refresh(); if (msg) toast(msg); return true; } catch (e) { toast(e.message || 'Something went wrong', true); return false; } };

const kids = id => S.fo.filter(f => f.parent_id === id).flatMap(f => [f.id, ...kids(f.id)]);
const fpath = id => { const f = byId(S.fo, id); return f ? (f.parent_id ? fpath(f.parent_id) + ' / ' : '') + f.name : ''; };
const wsName = b => byId(S.ws, b.workspace_id)?.name || '';
const locOpts = () => S.ws.flatMap(w => [[`w:${w.id}`, w.name], ...S.fo.filter(f => f.workspace_id === w.id).map(f => [`f:${f.id}`, `${w.name} / ${fpath(f.id)}`])]);
const decode = loc => loc.startsWith('f:')
  ? { workspace_id: byId(S.fo, loc.slice(2)).workspace_id, folder_id: loc.slice(2) }
  : { workspace_id: loc.slice(2), folder_id: null };

/* ---------- Router ---------- */
const go = (p, replace) => { history[replace ? 'replaceState' : 'pushState'](0, '', p); route(); };
async function route() {
  const p = path();
  S.user = await auth.session();
  if (p.startsWith('/app')) {
    if (!S.user) return go('/login', true);
    if (!S.loaded) { await load(); syncTheme(); }
    return shell(p);
  }
  if (['/login', '/signup'].includes(p) && S.user) return go('/app', true);
  const pages = { '/': landing, '/login': () => authPage('login'), '/signup': () => authPage('signup'), '/forgot': () => authPage('forgot'), '/reset': () => authPage('reset'), '/privacy': () => legal('privacy'), '/terms': () => legal('terms') };
  (pages[p] || notFound)();
  window.scrollTo(0, 0);
}

/* ---------- Dialog helpers ---------- */
/** Builds a form dialog from a field spec. Resolves to the form values, or null if cancelled. */
function ask(title, fields, { v = {}, ok = 'Save', check, text, html = '', ready } = {}) {
  const d = $('#dlg');
  d.onkeydown = null; d.onclick = e => { if (e.target === d) d.close(); };
  const input = f => f.opts
    ? `<select name="${f.k}">${f.opts.map(([val, lab]) => `<option value="${esc(val)}" ${val === (v[f.k] ?? '') ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
    : f.area ? `<textarea name="${f.k}" rows="3">${esc(v[f.k])}</textarea>`
    : `<input name="${f.k}" value="${esc(v[f.k])}" ${f.req ? 'required' : ''} autocomplete="off">`;
  d.innerHTML = `<form class="modal glass-strong"><h2>${esc(title)}</h2>${text ? `<p class="muted sm">${esc(text)}</p>` : ''}${html}${fields.map(f => `<label class="field">${f.l}${input(f)}</label>`).join('')}<p class="err" role="alert" hidden></p><div class="row end"><button type="button" class="btn" data-x>Cancel</button><button class="btn pri">${ok}</button></div></form>`;
  return new Promise(res => {
    const f = $('form', d);
    f.onsubmit = e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(f)), msg = check?.(data);
      if (msg) { const p = $('.err', f); p.textContent = msg; p.hidden = false; return; }
      res(data); d.close();
    };
    $('[data-x]', f).onclick = () => d.close();
    ready?.(f);
    d.onclose = () => res(null);
    d.showModal();
    (f.querySelector('input,select,textarea') || $('.pri', f)).focus();
  });
}
const sure = async (title, text, ok) => !!(await ask(title, [], { ok, text }));

/** Command-style search over titles, URLs, descriptions, categories, notes, folders and workspaces. */
function openSearch() {
  const d = $('#dlg');
  d.innerHTML = `<div class="modal glass-strong srch"><label class="sinput">${ic('search')}<input id="sq" placeholder="Search links, folders, workspaces…" autocomplete="off" aria-label="Search"></label><div class="sres" id="sres"></div></div>`;
  const q = $('#sq'), out = $('#sres');
  const paint = () => {
    const t = q.value.trim().toLowerCase();
    const hits = (t ? S.bm.filter(b => [b.title, b.url, b.description, b.category, b.notes, wsName(b), fpath(b.folder_id)].join(' ').toLowerCase().includes(t)) : S.bm.filter(b => !b.archived)).sort(byDate).slice(0, t ? 20 : 6);
    out.innerHTML = hits.length
      ? hits.map(b => `<a class="res" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" data-act="open" data-id="${b.id}">${ic('link')}<span class="bm-main"><b class="bm-t">${esc(b.title)}</b><span class="muted sm">${esc(host(b.url))} · ${esc(wsName(b))}${b.archived ? ' · archived' : ''}</span></span></a>`).join('')
      : `<p class="muted pad">${t ? 'No matching resources found.' : 'Your recent links will appear here.'}</p>`;
  };
  q.oninput = paint; paint();
  d.onkeydown = e => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const r = [...d.querySelectorAll('.res')], i = r.indexOf(document.activeElement), down = e.key === 'ArrowDown';
    (r[i + (down ? 1 : -1)] || (down ? r[0] : q))?.focus();
  };
  d.onclick = e => { if (e.target === d || e.target.closest('.res')) d.close(); };
  d.onclose = null; d.showModal(); q.focus();
}

/* ---------- Bookmark editor (add / edit / move via the Location field) ---------- */
async function saveBm(b, v) {
  const d = await ask(b ? 'Edit bookmark' : 'Add bookmark', [
    { k: 'url', l: 'URL', req: 1 }, { k: 'title', l: 'Title (optional)' }, { k: 'description', l: 'Description', area: 1 },
    { k: 'category', l: 'Category' }, { k: 'loc', l: 'Location', opts: locOpts() }, { k: 'notes', l: 'Notes', area: 1 },
  ], {
    v, ok: 'Save bookmark', ready: titleFetch,
    check: d => {
      const u = normUrl(d.url); if (!u) return 'Enter a valid URL, like example.com';
      const { workspace_id } = decode(d.loc);
      if (S.bm.some(x => x.workspace_id === workspace_id && x.url === u && x.id !== b?.id)) return 'This link is already saved in that workspace.';
    },
  });
  if (!d) return;
  const url = normUrl(d.url), loc = decode(d.loc);
  const row = { url, title: d.title.trim() || host(url), description: d.description.trim(), category: d.category.trim(), notes: d.notes.trim(), ...loc };
  run(() => (b ? repo.update('bookmarks', b.id, row) : repo.insert('bookmarks', { ...row, favorite: false, archived: false })), b ? 'Bookmark updated' : 'Bookmark saved');
}
const locOf = b => (b.folder_id ? 'f:' + b.folder_id : 'w:' + b.workspace_id);
const WS_FIELDS = [{ k: 'name', l: 'Name', req: 1 }, { k: 'description', l: 'Description', area: 1 }];

/* ---------- Actions (delegated through data-act) ---------- */
const ACT = {
  search: openSearch,
  addws: async () => {
    const d = await ask('New workspace', WS_FIELDS, { ok: 'Create workspace' }); if (!d) return;
    let row; await run(async () => { row = await repo.insert('workspaces', { name: d.name.trim(), description: d.description.trim() }); }, 'Workspace created');
    if (row) go('/app/w/' + row.id);
  },
  editws: async el => {
    const w = byId(S.ws, el.dataset.id), d = await ask('Edit workspace', WS_FIELDS, { v: w });
    if (d) run(() => repo.update('workspaces', w.id, { name: d.name.trim(), description: d.description.trim() }), 'Workspace updated');
  },
  delws: async el => {
    const w = byId(S.ws, el.dataset.id), n = S.bm.filter(b => b.workspace_id === w.id).length;
    if (!(await sure(`Delete “${w.name}”?`, `This permanently deletes the workspace, its folders and ${n} bookmark${n === 1 ? '' : 's'}. Export first if you might need them.`, 'Delete workspace'))) return;
    if (await run(() => repo.remove('workspaces', w.id), 'Workspace deleted')) go('/app/workspaces');
  },
  addfolder: async el => {
    const d = await ask('New folder', [{ k: 'name', l: 'Name', req: 1 }], { ok: 'Create folder' });
    if (d) run(() => repo.insert('folders', { workspace_id: el.dataset.ws, parent_id: el.dataset.parent || null, name: d.name.trim() }), 'Folder created');
  },
  editfolder: async el => {
    const f = byId(S.fo, el.dataset.id), bad = [f.id, ...kids(f.id)];
    const opts = [['', 'Top level'], ...S.fo.filter(x => x.workspace_id === f.workspace_id && !bad.includes(x.id)).map(x => [x.id, fpath(x.id)])];
    const d = await ask('Edit folder', [{ k: 'name', l: 'Name', req: 1 }, { k: 'parent_id', l: 'Move to', opts }], { v: { name: f.name, parent_id: f.parent_id || '' } });
    if (d) run(() => repo.update('folders', f.id, { name: d.name.trim(), parent_id: d.parent_id || null }), 'Folder updated');
  },
  delfolder: async el => {
    const f = byId(S.fo, el.dataset.id);
    if (S.fo.some(x => x.parent_id === f.id) || S.bm.some(b => b.folder_id === f.id)) return toast('Move or delete this folder’s contents first', true);
    if (!(await sure(`Delete “${f.name}”?`, 'The empty folder will be removed.', 'Delete folder'))) return;
    if (await run(() => repo.remove('folders', f.id), 'Folder deleted')) go(`/app/w/${f.workspace_id}${f.parent_id ? '/' + f.parent_id : ''}`);
  },
  addbm: el => {
    if (!S.ws.length) { toast('Create a workspace first'); return ACT.addws(); }
    saveBm(null, { loc: el?.dataset.loc || 'w:' + (S.lastWs || S.ws[0].id) });
  },
  editbm: el => { const b = byId(S.bm, el.dataset.id); saveBm(b, { ...b, loc: locOf(b) }); },
  fav: el => { const b = byId(S.bm, el.dataset.id); run(() => repo.update('bookmarks', b.id, { favorite: !b.favorite })); },
  arch: el => { const b = byId(S.bm, el.dataset.id); run(() => repo.update('bookmarks', b.id, { archived: !b.archived }), b.archived ? 'Bookmark restored' : 'Bookmark archived'); },
  delbm: async el => {
    const b = byId(S.bm, el.dataset.id);
    if (await sure('Delete permanently?', `“${b.title}” will be removed for good. Archive it instead to keep it recoverable.`, 'Delete')) run(() => repo.remove('bookmarks', b.id), 'Bookmark deleted');
  },
  copy: async el => {
    try { await navigator.clipboard.writeText(byId(S.bm, el.dataset.id).url); toast('URL copied'); } catch { toast('Couldn’t access the clipboard', true); }
  },
  open: el => { // records last-accessed only; the link itself opens normally
    const b = byId(S.bm, el.dataset.id); if (!b) return;
    b.last_accessed = new Date().toISOString();
    repo.update('bookmarks', b.id, { last_accessed: b.last_accessed }).catch(() => {});
  },
  export: exportHtml,
  logout: async () => {
    if (!(await sure('Sign out?', 'You can sign back in at any time.', 'Sign out'))) return;
    await auth.signOut(); Object.assign(S, { loaded: false, ws: [], fo: [], bm: [], user: null, lastWs: null }); go('/');
  },
  peek: el => { const i = el.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Show' : 'Hide'; },
  local: () => { enableLocal(); go('/app'); },
};

/** Exports the full hierarchy as a standard Netscape bookmarks HTML file. */
function exportHtml() {
  const links = (ws, fid) => S.bm.filter(b => b.workspace_id === ws && (b.folder_id || null) === fid).map(b => `<DT><A HREF="${esc(b.url)}">${esc(b.title)}</A>\n`).join('');
  const dir = (name, inner) => `<DT><H3>${esc(name)}</H3>\n<DL><p>\n${inner}</DL><p>\n`;
  const tree = (ws, parent) => S.fo.filter(f => f.workspace_id === ws && (f.parent_id || null) === parent).map(f => dir(f.name, tree(ws, f.id) + links(ws, f.id))).join('');
  const body = S.ws.map(w => dir(w.name, tree(w.id, null) + links(w.id, null))).join('');
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}</DL>\n`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'linkvault-bookmarks.html' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(S.bm.length ? `Exported ${S.bm.length} bookmark${S.bm.length === 1 ? '' : 's'}` : 'Exported an empty file — you have no bookmarks yet');
}

/* ---------- App views ---------- */
const btn = (act, label, extra = '', cls = 'btn pri') => `<button class="${cls}" data-act="${act}" ${extra}>${label}</button>`;
const empty = (t, p, action = '') => `<div class="empty"><h2>${t}</h2><p>${p}</p>${action}</div>`;
const head = (title, actions = '', crumbs = '') => `<div class="head"><div>${crumbs}<h1>${esc(title)}</h1></div><div class="row">${actions}</div></div>`;
const sortSel = () => `<select class="sel" data-sort aria-label="Sort bookmarks">${[['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A to Z'], ['manual', 'Manual order']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const sorted = l => [...l].sort({ new: byDate, old: (a, b) => -byDate(a, b), az: (a, b) => a.title.localeCompare(b.title), manual: (a, b) => pos(a) - pos(b) }[S.sort]);

const bmRow = b => `<article class="bm glass-soft" draggable="true" data-dt="b" data-id="${b.id}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"><span class="fav">${esc((b.title[0] || '?').toUpperCase())}<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(b.url))}&sz=64" alt="" loading="lazy"></span>
  <div class="bm-main"><a class="bm-t" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" data-act="open" data-id="${b.id}">${esc(b.title)}</a><span class="muted sm">${esc(host(b.url))}${b.category ? ' · ' + esc(b.category) : ''}</span>${b.description ? `<span class="muted sm clamp">${esc(b.description)}</span>` : ''}</div>
  <div class="acts">${[['fav', 'star', b.favorite ? 'Remove from favorites' : 'Add to favorites'], ['copy', 'copy', 'Copy URL'], ['editbm', 'edit', 'Edit or move'], ['arch', b.archived ? 'restore' : 'archive', b.archived ? 'Restore' : 'Archive'], ['delbm', 'trash', 'Delete permanently']]
    .map(([a, i, l]) => `<button class="ib ${a === 'fav' && b.favorite ? 'on' : ''}" data-act="${a}" data-id="${b.id}" aria-label="${l}" title="${l}">${ic(i)}</button>`).join('')}</div></article>`;
const section = (title, list, none) => `<h2 class="h2">${title}</h2>${list.length ? `<div class="list">${list.map(bmRow).join('')}</div>` : `<p class="muted sm">${none}</p>`}`;
const listView = (title, items, et, ep) => head(title, sortSel()) + (items.length ? `<div class="list">${sorted(items).map(bmRow).join('')}</div>` : empty(et, ep, btn('addbm', 'Add bookmark')));

const V = {
  home: () => {
    if (!S.ws.length) return head(`Welcome${S.user.user_metadata?.full_name ? ', ' + esc(S.user.user_metadata.full_name.split(' ')[0]) : ''}`) + empty('Your web, your way.', 'Start by creating your first workspace and bringing your favourite links together.', btn('addws', 'Create workspace'));
    const live = S.bm.filter(b => !b.archived);
    const opened = live.filter(b => b.last_accessed).sort((a, b) => b.last_accessed.localeCompare(a.last_accessed)).slice(0, 5);
    return head('Home', btn('addbm', ic('plus') + 'Add bookmark'))
      + `<div class="stats">${[['Bookmarks', live.length], ['Workspaces', S.ws.length], ['Favorites', live.filter(b => b.favorite).length]].map(([l, n]) => `<div class="stat glass-soft"><b>${n}</b><span class="muted">${l}</span></div>`).join('')}</div>`
      + section('Recently added', [...live].sort(byDate).slice(0, 5), 'Links you save will appear here.')
      + section('Recently opened', opened, 'Links you open will appear here.')
      + `<h2 class="h2">Workspaces</h2><div class="wgrid">${S.ws.map(w => `<a data-link class="wcard glass-soft" href="/app/w/${w.id}"><b>${esc(w.name)}</b><span class="muted sm">${esc(w.description) || 'No description'}</span><span class="muted sm">${live.filter(b => b.workspace_id === w.id).length} bookmarks</span></a>`).join('')}</div>`;
  },
  all: () => listView('All bookmarks', S.bm.filter(b => !b.archived), 'No bookmarks yet', 'Links you save will appear here.'),
  favorites: () => listView('Favorites', S.bm.filter(b => !b.archived && b.favorite), 'Your favourite resources will appear here.', 'Select the star on any bookmark to pin it here.'),
  archive: () => head('Archived', sortSel()) + (S.bm.some(b => b.archived) ? `<div class="list">${sorted(S.bm.filter(b => b.archived)).map(bmRow).join('')}</div>` : empty('Nothing archived', 'Archived bookmarks stay safe here until you restore or delete them.')),
  workspaces: () => head('Workspaces', btn('addws', ic('plus') + 'New workspace')) + (S.ws.length
    ? `<div class="list">${S.ws.map(w => `<div class="bm glass-soft"><a data-link class="bm-main" href="/app/w/${w.id}"><b>${esc(w.name)}</b><span class="muted sm">${esc(w.description) || 'No description'}</span></a><div class="acts"><button class="ib" data-act="editws" data-id="${w.id}" aria-label="Edit workspace">${ic('edit')}</button><button class="ib" data-act="delws" data-id="${w.id}" aria-label="Delete workspace">${ic('trash')}</button></div></div>`).join('')}</div>`
    : empty('No workspaces yet', 'Workspaces keep different parts of your life separate. Create your first one.', btn('addws', 'Create workspace'))),
  w: (id, fid) => {
    const w = byId(S.ws, id);
    if (!w) return empty('Workspace not found', 'It may have been deleted.', '<a data-link class="btn" href="/app/workspaces">Back to workspaces</a>');
    const f = fid && S.fo.find(x => x.id === fid && x.workspace_id === id), cur = f?.id || null;
    S.lastWs = id;
    const subs = S.fo.filter(x => x.workspace_id === id && (x.parent_id || null) === cur);
    const bms = sorted(S.bm.filter(b => !b.archived && b.workspace_id === id && (b.folder_id || null) === cur));
    const chain = []; for (let x = f; x; x = byId(S.fo, x.parent_id)) chain.unshift(x);
    const crumbs = `<a class="back" data-link href="${f ? `/app/w/${id}${f.parent_id ? '/' + f.parent_id : ''}` : '/app/workspaces'}">${ic('chevron')}Back</a><nav class="crumbs" aria-label="Breadcrumb"><a data-link href="/app/workspaces">Workspaces</a>/<a data-link href="/app/w/${id}">${esc(w.name)}</a>${chain.map(x => `/<a data-link href="/app/w/${id}/${x.id}">${esc(x.name)}</a>`).join('')}</nav>`;
    const actions = sortSel() + btn('addfolder', ic('folder') + 'New folder', `data-ws="${id}" data-parent="${cur || ''}"`, 'btn') + btn('addbm', ic('plus') + 'Add bookmark', `data-loc="${cur ? 'f:' + cur : 'w:' + id}"`)
      + (f ? `<button class="ib" data-act="editfolder" data-id="${f.id}" aria-label="Edit or move folder">${ic('edit')}</button><button class="ib" data-act="delfolder" data-id="${f.id}" aria-label="Delete folder">${ic('trash')}</button>`
             : `<button class="ib" data-act="editws" data-id="${id}" aria-label="Edit workspace">${ic('edit')}</button>`);
    const rows = subs.map(x => `<a data-link class="frow glass-soft" draggable="true" data-dt="f" data-id="${x.id}" href="/app/w/${id}/${x.id}">${ic('folder')}<span>${esc(x.name)}</span><span class="muted sm">${S.bm.filter(b => !b.archived && [x.id, ...kids(x.id)].includes(b.folder_id)).length}</span>${ic('chevron')}</a>`).join('');
    const body = subs.length || bms.length ? `<div class="list">${rows}${bms.map(bmRow).join('')}</div>` : empty('This workspace is waiting for its first link.', 'Add a bookmark or organize with folders.', btn('addbm', 'Add bookmark', `data-loc="${cur ? 'f:' + cur : 'w:' + id}"`));
    return head(f ? f.name : w.name, actions, crumbs) + (!f && w.description ? `<p class="muted" style="margin:-12px 0 18px">${esc(w.description)}</p>` : '') + body;
  },
  settings: () => `${head('Settings')}
    ${configured ? `<section class="card glass-soft"><h2>Profile</h2><form data-form="profile" class="stack"><label class="field">Full name<input name="name" value="${esc(S.user.user_metadata?.full_name || '')}" autocomplete="name"></label><p class="muted sm">Signed in as ${esc(S.user.email)}</p>${ERR}<div><button class="btn pri">Save profile</button></div></form></section>
    <section class="card glass-soft"><h2>Security</h2><form data-form="password" class="stack">${pw('password', 'New password', 'new-password')}${ERR}<div><button class="btn pri">Update password</button></div></form></section>` : ''}
    <section class="card glass-soft"><h2>Appearance</h2><label class="field">Theme<select data-pref>${[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<option value="${v}" ${pref === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></section>
    <section class="card glass-soft"><h2>Import and export</h2><p class="muted sm">Import a browser bookmarks HTML export, or export everything saved here. Drag rows to reorder or move them; Alt+Arrow keys also reorder.</p><div class="row"><label class="btn">${ic('plus')}Import bookmarks<input type="file" accept=".html,.htm,text/html" data-import hidden></label>${btn('export', ic('download') + 'Export bookmarks', '', 'btn')}</div></section>
    <section class="card glass-soft"><h2>Session</h2><p class="muted sm">${configured ? esc(S.user.email) : 'Local development mode: data lives in this browser only.'}</p><div>${btn('logout', 'Sign out', '', 'btn')}</div></section>`,
};

function shell(p) {
  const [, , v = 'home', a, b] = p.split('/');
  const view = V[v] ? v : 'home', content = V[view](a, b);
  const curW = view === 'w' ? a : S.lastWs;
  const nav = [['/app', 'home', 'Home', 'home'], ['/app/all', 'all', 'All bookmarks', 'bookmark'], ['/app/favorites', 'favorites', 'Favorites', 'star'], ['/app/archive', 'archive', 'Archived', 'archive']];
  const tree = (ws, parent, d) => S.fo.filter(f => f.workspace_id === ws && (f.parent_id || null) === parent).map(f => `<a data-link class="nav ${f.id === b ? 'on' : ''}" draggable="true" data-dt="f" data-id="${f.id}" style="--d:${d}" href="/app/w/${ws}/${f.id}">${ic('folder')}${esc(f.name)}</a>${tree(ws, f.id, d + 1)}`).join('');
  const tabs = [['/app', 'home', 'Home', 'home'], [null, 'search', 'Explore', 'search'], ['/app/favorites', 'favorites', 'Favorites', 'star'], ['/app/workspaces', 'workspaces', 'Spaces', 'layers'], ['/app/settings', 'settings', 'Profile', 'user']];
  root.innerHTML = `<div class="app">
    <aside class="side glass" aria-label="Sidebar"><a class="brand" data-link href="/app">${ic('link')}LinkVault</a>
      ${nav.map(([h, k, l, i]) => `<a data-link class="nav ${view === k ? 'on' : ''}" href="${h}">${ic(i)}${l}</a>`).join('')}
      <div class="sec"><a data-link href="/app/workspaces">Workspaces</a><button class="ib" data-act="addws" aria-label="New workspace">${ic('plus')}</button></div>
      ${S.ws.map(w => `<a data-link class="nav ${view === 'w' && a === w.id && !b ? 'on' : ''}" draggable="true" data-dt="w" data-id="${w.id}" href="/app/w/${w.id}">${ic('layers')}${esc(w.name)}</a>${w.id === curW ? tree(w.id, null, 1) : ''}`).join('') || '<p class="muted sm pad">No workspaces yet.</p>'}
      <div class="foot"><a data-link class="nav ${view === 'settings' ? 'on' : ''}" href="/app/settings">${ic('user')}Settings</a></div></aside>
    <div class="main">
      ${configured ? '' : '<div class="banner">Local development mode — data stays in this browser only. It isn’t synced across devices or secured.</div>'}
      <header class="dtop glass"><button class="searchbtn glass-soft" data-act="search">${ic('search')}Search your links…<kbd>Ctrl K</kbd></button>${btn('addbm', ic('plus') + 'Add bookmark')}</header>
      <header class="mtop"><a data-link class="brand" href="/app" style="padding:0">${ic('link')}LinkVault</a><button class="ib" data-act="search" aria-label="Search">${ic('search')}</button></header>
      <main id="main">${content}</main></div>
    <nav class="tabs glass" aria-label="Primary">${tabs.map(([h, k, l, i]) => h ? `<a data-link class="tab ${view === k ? 'on' : ''}" href="${h}">${ic(i)}${l}</a>` : `<button class="tab" data-act="search">${ic(i)}${l}</button>`).join('')}</nav>
    <button class="fab glass" data-act="addbm" aria-label="Add bookmark">${ic('plus')}</button></div>`;
}

/* ---------- Public pages ---------- */
const ERR = '<p class="err" role="alert" hidden></p>';
const pw = (n, l, auto) => `<label class="field">${l}<span class="pw"><input name="${n}" type="password" required minlength="8" autocomplete="${auto}"><button type="button" class="link" data-act="peek">Show</button></span></label>`;
const email = '<label class="field">Email<input name="email" type="email" required autocomplete="email"></label>';
const AF = {
  login: `<form data-form="login" class="stack">${email}${pw('password', 'Password', 'current-password')}${ERR}<button class="btn pri">Sign in</button></form><p class="sm muted"><a data-link class="link" href="/forgot">Forgot password?</a> · <a data-link class="link" href="/signup">Create an account</a></p>`,
  signup: `<form data-form="signup" class="stack"><label class="field">Full name<input name="name" required autocomplete="name"></label>${email}${pw('password', 'Password (8+ characters)', 'new-password')}${pw('confirm', 'Confirm password', 'new-password')}${ERR}<button class="btn pri">Create account</button></form><p class="sm muted">Already have an account? <a data-link class="link" href="/login">Sign in</a></p><p class="sm muted">By creating an account you agree to the <a data-link class="link" href="/terms">Terms</a> and <a data-link class="link" href="/privacy">Privacy policy</a>.</p>`,
  forgot: `<form data-form="forgot" class="stack">${email}${ERR}<button class="btn pri">Send reset link</button></form><p class="sm muted"><a data-link class="link" href="/login">Back to sign in</a></p>`,
  reset: `<form data-form="reset" class="stack">${pw('password', 'New password', 'new-password')}${pw('confirm', 'Confirm password', 'new-password')}${ERR}<button class="btn pri">Update password</button></form>`,
};
const TITLES = { login: ['Welcome back', 'Sign in to your LinkVault.'], signup: ['Create your account', 'Start with an empty vault and build it your way.'], forgot: ['Reset your password', 'We’ll email you a link to choose a new one.'], reset: ['Choose a new password', ''] };
function authPage(mode) {
  const [t, sub] = TITLES[mode];
  const body = !configured
    ? `<div class="notice"><b>Supabase isn’t configured</b><p class="sm muted">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild. See the README.</p></div><div class="notice"><b>Local development mode</b><p class="sm muted">Stores data in this browser only. There are no real accounts, nothing syncs across devices, and it isn’t secure.</p><button class="btn" data-act="local">Continue in local mode</button></div>`
    : mode === 'reset' && !S.user ? '<div class="notice"><b>This reset link is invalid or has expired.</b><a data-link class="btn" href="/forgot">Request a new link</a></div>' : AF[mode];
  root.innerHTML = `<main class="authwrap"><section class="auth glass-strong"><a class="brand" data-link href="/">${ic('link')}LinkVault</a><h1>${t}</h1><p class="muted">${sub}</p>${body}</section></main>`;
}
const notFound = () => { root.innerHTML = `<main class="authwrap"><section class="auth glass-strong"><h1>Page not found</h1><p class="muted">That page doesn’t exist.</p><a data-link class="btn" href="/">Back to home</a></section></main>`; };
function landing() {
  const cards = l => `<div class="three">${l.map(([t, p]) => `<div class="glass-soft"><b>${t}</b><span class="muted sm">${p}</span></div>`).join('')}</div>`;
  const chips = l => `<div class="chips">${l.map(x => `<span>${x}</span>`).join('')}</div>`;
  root.innerHTML = `<header class="lnav"><a class="brand" data-link href="/" style="padding:0">${ic('link')}LinkVault</a><nav class="row"><a data-link class="btn ghost" href="/login">Log in</a><a data-link class="btn pri" href="/signup">Get started</a></nav></header>
  <main class="land"><section class="hero"><h1>Your entire web, organized.</h1><p class="lead">Save, organize and access all your important websites from one beautifully organized workspace.</p>
    <div class="row" style="justify-content:center"><a data-link class="btn pri lg" href="/signup">Get started</a><a class="btn lg" href="#how">Explore LinkVault</a></div>
    <div class="prev glass" aria-hidden="true"><div><i></i><i></i><i></i><i></i></div><div class="pm"><i style="width:40%;height:14px;border:0"></i><i></i><i></i><i></i></div></div></section>
  <section id="how"><h2>How it works</h2>${cards([['1. Save your links', 'Add any website in seconds, with a title, notes and category.'], ['2. Organize them', 'Group links into workspaces and nested folders.'], ['3. Find them fast', 'Search everything instantly, from anywhere in the app.']])}</section>
  <section><h2>Built for everyone who lives on the web</h2>${chips(['Developers', 'Students', 'Designers', 'Office professionals', 'Entrepreneurs', 'Everyday internet users'])}</section>
  <section><h2>What you get</h2>${chips(['Centralized bookmarks', 'Custom workspaces', 'Nested folders', 'Instant search', 'Drag-and-drop organization', 'Favorites and archive', 'Import and export', 'Light and dark themes'])}</section>
  <section class="cta"><h2 style="font-size:28px">Start with an empty vault. Make it yours.</h2><a data-link class="btn pri lg" href="/signup">Create your account</a></section></main>
  ${footer()}`;
}

/* ---------- Forms ---------- */
const busy = async (f, fn) => {
  const b = $('button.pri', f), e = $('.err', f), label = b.textContent;
  b.disabled = true; b.textContent = 'Please wait…'; e.hidden = true;
  try { await fn(Object.fromEntries(new FormData(f))); } catch (x) { e.textContent = x.message || 'Something went wrong.'; e.hidden = false; }
  b.disabled = false; b.textContent = label;
};
const match = v => { if (v.password !== v.confirm) throw new Error('Passwords don’t match.'); };
const FORMS = {
  login: f => busy(f, async v => { const { error } = await auth.signIn(v.email, v.password); if (error) throw error; go('/app'); }),
  signup: f => busy(f, async v => {
    match(v);
    const { data, error } = await auth.signUp(v.email, v.password, v.name.trim()); if (error) throw error;
    if (data.session) return go('/app');
    f.outerHTML = `<div class="notice"><b>Check your inbox</b><p class="sm muted">We sent a verification link to ${esc(v.email)}. Open it to finish creating your account.</p></div>`;
  }),
  forgot: f => busy(f, async v => { const { error } = await auth.forgot(v.email); if (error) throw error; f.outerHTML = '<div class="notice"><b>Email sent</b><p class="sm muted">If that address has an account, a reset link is on its way.</p></div>'; }),
  reset: f => busy(f, async v => { match(v); const { error } = await auth.setPassword(v.password); if (error) throw error; toast('Password updated'); go('/app'); }),
  profile: f => busy(f, async v => { const { error } = await auth.updateName(v.name.trim()); if (error) throw error; S.user = await auth.session(); toast('Profile saved'); }),
  password: f => busy(f, async v => { const { error } = await auth.setPassword(v.password); if (error) throw error; f.reset(); toast('Password updated'); }),
};

/* ---------- Theme (system / dark / light) ---------- */
const mq = matchMedia('(prefers-color-scheme: light)');
let pref = localStorage.getItem('lv:theme') || 'system';
const applyTheme = () => { document.documentElement.dataset.theme = pref === 'system' ? (mq.matches ? 'light' : 'dark') : pref; };
mq.addEventListener('change', applyTheme);
applyTheme();
/** Pulls the saved theme from user_preferences after sign-in (silently ignored if the table is missing). */
async function syncTheme() {
  try { const p = await prefs.get(); if (p?.theme && p.theme !== pref) { pref = p.theme; localStorage.setItem('lv:theme', pref); applyTheme(); render(); } } catch { /* keep local preference */ }
}

/* ---------- Automatic title lookup (Supabase Edge Function; never blocks saving) ---------- */
function titleFetch(f) {
  const u = f.elements.url, t = f.elements.title;
  u.addEventListener('blur', async () => {
    const url = normUrl(u.value); if (!url || t.value.trim()) return;
    t.placeholder = 'Fetching title…';
    const title = await meta(url);
    if (title && !t.value.trim()) t.value = title;
    t.placeholder = host(url);
  });
}

/* ---------- Drag and drop (mouse; touch where the browser supports native drag) + Alt+Arrow keyboard reordering ---------- */
const TBL = { b: 'bookmarks', f: 'folders', w: 'workspaces' };
const SRC = () => ({ b: S.bm, f: S.fo, w: S.ws });
let drag = null;
const clearDrop = () => document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
/** Where a drop would land: before/after the target (reorder) or into it (move). null = not allowed. */
function dropMode(D, T, el, y) {
  const r = el.getBoundingClientRect(), f = (y - r.top) / r.height;
  if (D === 'b') return T === 'b' ? (f < .5 ? 'before' : 'after') : 'into';
  if (D === 'f') return T === 'f' ? (f < .25 ? 'before' : f > .75 ? 'after' : 'into') : T === 'w' ? 'into' : null;
  return T === 'w' ? (f < .5 ? 'before' : 'after') : null;
}
function moveTo(D, id, T, tid, mode) {
  const item = byId(SRC()[D], id), tgt = byId(SRC()[T], tid);
  if (!item || !tgt || item === tgt) return;
  const sameWs = D !== 'f' || item.workspace_id === (T === 'f' ? tgt.workspace_id : tgt.id);
  if (!sameWs || (D === 'f' && T === 'w' && mode !== 'into')) return toast('Folders can only move within their workspace', true);
  let patch;
  if (mode === 'into') {
    if (D === 'b') patch = T === 'f' ? { workspace_id: tgt.workspace_id, folder_id: tgt.id } : { workspace_id: tgt.id, folder_id: null };
    else {
      if (T === 'f' && [item.id, ...kids(item.id)].includes(tgt.id)) return toast('A folder can’t move into itself', true);
      patch = { parent_id: T === 'f' ? tgt.id : null };
    }
  } else {
    const same = x => x.id !== id && (D === 'b' ? x.workspace_id === tgt.workspace_id && (x.folder_id || null) === (tgt.folder_id || null) && !x.archived === !tgt.archived
      : D === 'f' ? x.workspace_id === tgt.workspace_id && (x.parent_id || null) === (tgt.parent_id || null) : true);
    const sibs = SRC()[D].filter(same).sort((a, b) => pos(a) - pos(b)), i = sibs.indexOf(tgt);
    const [lo, hi] = mode === 'before' ? [sibs[i - 1], tgt] : [tgt, sibs[i + 1]];
    patch = { position: lo && hi ? (pos(lo) + pos(hi)) / 2 : lo ? pos(lo) + 1000 : pos(hi) - 1000 };
    if (D === 'b') Object.assign(patch, { workspace_id: tgt.workspace_id, folder_id: tgt.folder_id || null });
    if (D === 'f') patch.parent_id = tgt.parent_id || null;
    S.sort = 'manual';
  }
  return run(() => repo.update(TBL[D], id, patch), 'Moved');
}
const dtEl = e => e.target.closest?.('[data-dt]');
document.addEventListener('dragstart', e => {
  const el = dtEl(e); if (!el) return;
  drag = { D: el.dataset.dt, id: el.dataset.id };
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.id); el.classList.add('dragging');
});
document.addEventListener('dragover', e => {
  const el = dtEl(e); if (!drag || !el || el.dataset.id === drag.id) return;
  const m = dropMode(drag.D, el.dataset.dt, el, e.clientY); clearDrop();
  if (m) { e.preventDefault(); el.classList.add('drop-' + m); }
});
document.addEventListener('drop', e => {
  const el = dtEl(e); if (!drag || !el) return;
  const m = dropMode(drag.D, el.dataset.dt, el, e.clientY), d = drag; e.preventDefault(); clearDrop();
  if (m) moveTo(d.D, d.id, el.dataset.dt, el.dataset.id, m);
});
document.addEventListener('dragend', () => { drag = null; clearDrop(); document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging')); });
document.addEventListener('keydown', e => { // accessible alternative to dragging
  if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const el = dtEl(e); if (!el || (el.dataset.dt === 'f' && el.closest('.side'))) return;
  const k = el.dataset.dt, id = el.dataset.id, down = e.key === 'ArrowDown';
  const peers = [...el.parentElement.children].filter(x => x.dataset.dt === k), n = peers[peers.indexOf(el) + (down ? 1 : -1)];
  if (!n) return;
  e.preventDefault();
  const scope = el.closest('.side') ? '.side' : '#main';
  moveTo(k, id, n.dataset.dt, n.dataset.id, down ? 'after' : 'before')?.then(() => { const t = $(`${scope} [data-dt="${k}"][data-id="${id}"]`); (t?.matches('a') ? t : t?.querySelector('a'))?.focus(); });
});

/* ---------- Import (browser bookmarks HTML) ---------- */
function parseBookmarks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), out = []; let pending = null;
  const walk = (node, path) => {
    for (const el of node.children) {
      if (el.tagName === 'H3') pending = el.textContent.trim();
      else if (el.tagName === 'A') { const url = normUrl(el.getAttribute('href')); if (url) out.push({ title: el.textContent.trim(), url, path }); }
      else if (el.tagName === 'DL') { const name = pending; pending = null; walk(el, name ? [...path, name] : path); }
      else walk(el, path);
    }
  };
  walk(doc.body, []);
  return out;
}
async function handleImport(file) {
  if (!S.ws.length) return toast('Create a workspace first, then import', true);
  const items = parseBookmarks(await file.text());
  if (!items.length) return toast('No bookmarks found in that file', true);
  const row = i => `<div class="res"><span class="bm-main"><b class="bm-t">${esc(i.title || host(i.url))}</b><span class="muted sm">${esc(host(i.url))}${i.path.length ? ' · ' + esc(i.path.join(' / ')) : ''}</span></span></div>`;
  const d = await ask('Import bookmarks', [
    { k: 'loc', l: 'Import into', opts: locOpts() },
    { k: 'keep', l: 'Folders', opts: [['1', 'Keep the folder structure'], ['0', 'Put everything in one place']] },
  ], {
    ok: `Import ${items.length}`, v: { loc: S.lastWs ? 'w:' + S.lastWs : '' },
    text: `Review the ${items.length} link${items.length === 1 ? '' : 's'} found. Links already saved in the chosen workspace are skipped.`,
    html: `<div class="sres imp">${items.slice(0, 50).map(row).join('')}${items.length > 50 ? `<p class="muted sm pad">…and ${items.length - 50} more</p>` : ''}</div>`,
  });
  if (!d) return;
  const base = decode(d.loc), seen = new Set(S.bm.filter(b => b.workspace_id === base.workspace_id).map(b => b.url)), made = new Map();
  let ok = 0, skipped = 0, failed = 0;
  const dlg = $('#dlg'); dlg.onclose = null; dlg.onclick = null;
  dlg.innerHTML = '<div class="modal glass-strong" role="status"><b>Importing…</b><p class="muted sm" id="prog"></p></div>'; dlg.showModal();
  for (const [i, it] of items.entries()) {
    $('#prog').textContent = `${i + 1} of ${items.length}`;
    if (seen.has(it.url)) { skipped++; continue; }
    try {
      let parent = base.folder_id;
      if (d.keep === '1') for (const name of it.path) {
        const k = `${parent || ''}|${name}`;
        if (!made.has(k)) {
          const ex = S.fo.find(f => f.workspace_id === base.workspace_id && (f.parent_id || null) === (parent || null) && f.name === name);
          made.set(k, ex ? ex.id : (await repo.insert('folders', { workspace_id: base.workspace_id, parent_id: parent || null, name })).id);
        }
        parent = made.get(k);
      }
      await repo.insert('bookmarks', { workspace_id: base.workspace_id, folder_id: parent || null, title: it.title || host(it.url), url: it.url, description: '', category: '', notes: '', favorite: false, archived: false });
      seen.add(it.url); ok++;
    } catch { failed++; }
  }
  dlg.close(); await refresh();
  toast(`Imported ${ok}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}${failed ? `, ${failed} failed` : ''}`, failed > 0);
}

/* ---------- Legal pages ---------- */
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;
const LEGAL = {
  privacy: ['Privacy policy', [
    ['What we collect', 'Your name and email address when you create an account, and the workspaces, folders and bookmarks you choose to save. We don’t track which sites you visit.'],
    ['Where it’s stored', 'Your data is stored with our backend provider, Supabase. Database rules limit every record to the account that created it.'],
    ['Third parties', 'Site icons come from Google’s favicon service, which receives the domain names of the sites you save. When title lookup is on, an address you enter is fetched by a server function to read the page title.'],
    ['Your control', 'You can export your bookmarks at any time from Settings and ask for your account and data to be deleted.'],
    ['What we don’t do', 'We don’t sell your data or show advertising.'],
  ]],
  terms: ['Terms of service', [
    ['Using LinkVault', 'LinkVault lets you save and organize links. You must be able to form a binding agreement and keep your sign-in details secure.'],
    ['Your content', 'You own what you save. You give us permission to store and display it to you so the service works.'],
    ['Acceptable use', 'Don’t use LinkVault to break the law, abuse the service, or attempt to access other people’s data.'],
    ['Availability', 'The service is provided as is, without guarantees of uninterrupted availability. Export your bookmarks regularly to keep your own copy.'],
    ['Changes and ending', 'We may update these terms or the service, and you can stop using it and delete your account at any time.'],
  ]],
};
const footer = () => `<footer class="lfoot"><span>© LinkVault</span><nav class="row"><a data-link href="/login">Log in</a><a data-link href="/signup">Sign up</a><a data-link href="/privacy">Privacy</a><a data-link href="/terms">Terms</a>${CONTACT ? `<a href="mailto:${esc(CONTACT)}">Contact</a>` : ''}</nav></footer>`;
function legal(kind) {
  const [t, secs] = LEGAL[kind];
  root.innerHTML = `<header class="lnav"><a class="brand" data-link href="/" style="padding:0">${ic('link')}LinkVault</a><nav class="row"><a data-link class="btn ghost" href="/login">Log in</a></nav></header><main class="land legal"><h1>${t}</h1><p class="muted sm">Last updated 7 November 2026</p>${secs.map(([h, p]) => `<h2>${h}</h2><p class="muted">${p}</p>`).join('')}</main>${footer()}`;
}

/* ---------- Boot ---------- */
document.addEventListener('click', e => {
  const l = e.target.closest('a[data-link]');
  if (l && !e.metaKey && !e.ctrlKey) { e.preventDefault(); return go(l.getAttribute('href')); }
  const el = e.target.closest('[data-act]');
  if (el) ACT[el.dataset.act]?.(el, e);
});
document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (f) { e.preventDefault(); FORMS[f.dataset.form](f); } });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-sort]')) { S.sort = t.value; render(); }
  if (t.matches('[data-pref]')) { pref = t.value; applyTheme(); prefs.set(pref).catch(() => {}); }
  if (t.matches('[data-import]')) { const f = t.files[0]; t.value = ''; if (f) handleImport(f); }
});
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.user && path().startsWith('/app')) { e.preventDefault(); openSearch(); } });
document.addEventListener('error', e => { if (e.target.matches?.('.fav img')) e.target.remove(); }, true); // fall back to the letter avatar
addEventListener('popstate', route);
auth.onChange(ev => {
  if (ev === 'PASSWORD_RECOVERY') go('/reset', true);
  if (ev === 'SIGNED_OUT') { S.loaded = false; if (path().startsWith('/app')) go('/login', true); }
});
route();
