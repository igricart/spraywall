// Supabase. URL + publishable key are public by design: what they allow is limited by the
// row-level-security policies in supabase/migrations.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasBackend = Boolean(URL && KEY);
// PKCE: Google sends us back with ?code=..., leaving the #route hash alone
const sb = hasBackend ? createClient(URL, KEY, { auth: { flowType: 'pkce' } }) : null;

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ponytail: newest 500, no paging; add .range() when a wall has more routes than that
export const listRoutes = () =>
  sb
    .from('routes_with_stats')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
    .then(ok);

export const saveRoute = (r) => sb.from('routes').insert(r).select().single().then(ok);

// Sends and votes need a Google login; browsing and creating routes don't.
export function onUser(cb) {
  sb.auth.getSession().then(({ data }) => cb(data.session?.user ?? null));
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

export const RETURN_KEY = 'returnHash'; // route to reopen after the Google round trip

export function signIn() {
  try {
    localStorage.setItem(RETURN_KEY, location.hash);
  } catch {
    // storage blocked: we come back to the route list instead
  }
  return sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export const signOut = () => sb.auth.signOut();

async function userId() {
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function myAscents() {
  const uid = await userId();
  if (!uid) return [];
  return sb.from('ascents').select('route_id,difficulty,rating').eq('user_id', uid).then(ok);
}

// a = { route_id, difficulty, rating }; logging again updates the same ascent
export async function logAscent(a) {
  const user_id = await userId();
  if (!user_id) throw new Error('Sign in first');
  return sb
    .from('ascents')
    .upsert({ ...a, user_id }, { onConflict: 'route_id,user_id' })
    .select('route_id,difficulty,rating')
    .single()
    .then(ok);
}

export async function removeAscent(route_id) {
  const uid = await userId();
  return sb.from('ascents').delete().eq('route_id', route_id).eq('user_id', uid).then(ok);
}

// ---- Wall (photo + hold map). Everyone reads the latest published row; only admins publish.

export const currentWall = () =>
  sb.from('walls').select('*').order('id', { ascending: false }).limit(1).maybeSingle().then(ok);

export const isAdmin = (uid) =>
  sb.from('admins').select('user_id').eq('user_id', uid).maybeSingle().then(ok).then(Boolean);

export const publishWall = (w) => sb.from('walls').insert(w).select().single().then(ok);

export async function uploadPhoto(blob) {
  const path = `wall-${Date.now()}.jpg`;
  ok(await sb.storage.from('walls').upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from('walls').getPublicUrl(path).data.publicUrl;
}
