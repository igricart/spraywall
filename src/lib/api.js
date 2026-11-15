// Supabase. URL + publishable key are public by design: what they allow is limited by the
// row-level-security policies in supabase/migrations.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasBackend = Boolean(URL && KEY);
const sb = hasBackend ? createClient(URL, KEY) : null;

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

// Ascents belong to a user. The first send on a device silently creates an anonymous account.
async function userId(create) {
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  return create ? ok(await sb.auth.signInAnonymously()).user.id : null;
}

export async function myAscents() {
  const uid = await userId(false);
  if (!uid) return [];
  return sb.from('ascents').select('route_id,difficulty,rating').eq('user_id', uid).then(ok);
}

// a = { route_id, difficulty, rating }; logging again updates the same ascent
export async function logAscent(a) {
  const user_id = await userId(true);
  return sb
    .from('ascents')
    .upsert({ ...a, user_id }, { onConflict: 'route_id,user_id' })
    .select('route_id,difficulty,rating')
    .single()
    .then(ok);
}

export async function removeAscent(route_id) {
  const uid = await userId(false);
  return sb.from('ascents').delete().eq('route_id', route_id).eq('user_id', uid).then(ok);
}
