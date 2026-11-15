// Supabase REST (PostgREST) over plain fetch. Both values are public by design: what they allow is
// limited by the row-level-security policies in supabase/migrations.
// ponytail: no supabase-js until we need auth.
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasBackend = Boolean(URL && KEY);

async function rest(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// ponytail: newest 500, no paging; add range headers when a wall has more routes than that
export const listRoutes = () => rest('routes?select=*&order=created_at.desc&limit=500');

export const saveRoute = (r) =>
  rest('routes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(r),
  }).then((rows) => rows[0]);
