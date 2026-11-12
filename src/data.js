/* LinkVault — data.js
   The only file that talks to Supabase or localStorage. The UI calls `auth` and `repo`.
   - Supabase mode: used whenever VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY exist.
   - Local mode: dev-only, opt-in, browser storage. No real accounts, not synced, not secure. */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
const sb = configured ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null;

const LOCAL = 'lv:local';
export const enableLocal = () => localStorage.setItem(LOCAL, '1');

export const auth = {
  async session() {
    if (sb) return (await sb.auth.getSession()).data.session?.user ?? null;
    return localStorage.getItem(LOCAL) ? { id: 'local', email: 'Local development mode', user_metadata: {} } : null;
  },
  signUp: (email, password, name) => sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin + '/app' } }),
  signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
  signOut: () => (sb ? sb.auth.signOut() : localStorage.removeItem(LOCAL)),
  forgot: email => sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/reset' }),
  setPassword: password => sb.auth.updateUser({ password }),
  async updateName(name) { // name lives in auth metadata and is mirrored to the profiles table
    const r = await sb.auth.updateUser({ data: { full_name: name } });
    if (!r.error) await sb.from('profiles').upsert({ id: r.data.user.id, full_name: name });
    return r;
  },
  onChange: cb => sb?.auth.onAuthStateChange(cb),
};

// Tables: workspaces, folders, bookmarks (see supabase/migrations). user_id defaults to auth.uid() in SQL.
const read = t => JSON.parse(localStorage.getItem('lv:' + t) || '[]');
const write = (t, rows) => localStorage.setItem('lv:' + t, JSON.stringify(rows));
const ok = ({ data, error }) => { if (error) throw error; return data; };

export const repo = {
  async list(t) {
    return sb ? ok(await sb.from(t).select('*').order('position').order('created_at')) : read(t).sort((a, b) => (a.position ?? Date.parse(a.created_at)) - (b.position ?? Date.parse(b.created_at)));
  },
  async insert(t, row) {
    if (sb) return ok(await sb.from(t).insert(row).select().single());
    const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), position: Date.now(), ...row };
    write(t, [...read(t), r]);
    return r;
  },
  async update(t, id, patch) {
    if (sb) return ok(await sb.from(t).update(patch).eq('id', id));
    write(t, read(t).map(r => (r.id === id ? { ...r, ...patch } : r)));
  },
  async remove(t, id) {
    if (sb) return ok(await sb.from(t).delete().eq('id', id));
    write(t, read(t).filter(r => r.id !== id));
    if (t === 'workspaces') { // mirror the SQL cascade
      write('folders', read('folders').filter(r => r.workspace_id !== id));
      write('bookmarks', read('bookmarks').filter(r => r.workspace_id !== id));
    }
  },
};

/** Theme preference: user_preferences in Supabase mode, plus a local copy so it applies before sign-in. */
export const prefs = {
  async get() {
    if (!sb) return { theme: localStorage.getItem('lv:theme') };
    return ok(await sb.from('user_preferences').select('theme').maybeSingle());
  },
  async set(theme) {
    localStorage.setItem('lv:theme', theme);
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    await sb.from('user_preferences').upsert({ user_id: data.session.user.id, theme, updated_at: new Date().toISOString() });
  },
};

/** Page title lookup via the fetch-metadata Edge Function. Returns null whenever it can't help (local mode, offline, blocked). */
export const meta = async url => {
  if (!sb) return null;
  try { const { data, error } = await sb.functions.invoke('fetch-metadata', { body: { url } }); return error ? null : data?.title || null; } catch { return null; }
};
