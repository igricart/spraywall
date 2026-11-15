import { useEffect, useState } from 'react';
import Wall from './components/Wall.jsx';
import RouteList from './components/RouteList.jsx';
import Ascent from './components/Ascent.jsx';
import {
  RETURN_KEY,
  currentWall,
  hasBackend,
  isAdmin,
  myAscents,
  onUser,
  publishWall,
  saveRoute,
  signIn,
  signOut,
  uploadPhoto,
} from './lib/api.js';
import { gradeLabel, gradeOptions } from './lib/grades.js';
import { FEET, decode, encode } from './lib/route.js';
import { clamp01, nextId, parseHoldsFile } from './lib/holds.js';
import { shrinkPhoto } from './lib/photo.js';

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: preference lasts until reload
  }
}
// Back from Google sign-in (?code=...): reopen the route we left, if any.
function startHash() {
  if (!new URLSearchParams(location.search).has('code')) return location.hash;
  const saved = readPref(RETURN_KEY, '');
  try {
    localStorage.removeItem(RETURN_KEY);
  } catch {
    // nothing to clean up
  }
  return saved || location.hash;
}

// Admin's unpublished hold map: { photo (null = keep published photo), holds }.
// Holds mapped before publishing existed ('holds-w1' / 'holds' keys) become the first draft.
const DRAFT_KEY = 'wall-draft';
function readDraft() {
  try {
    const d = localStorage.getItem(DRAFT_KEY);
    if (d) return JSON.parse(d);
    const legacy = localStorage.getItem('holds-w1') ?? localStorage.getItem('holds');
    return legacy ? { photo: null, holds: JSON.parse(legacy) } : null;
  } catch {
    return null;
  }
}
function writeDraft(d) {
  try {
    if (d) return localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    for (const k of [DRAFT_KEY, 'holds-w1', 'holds']) localStorage.removeItem(k);
  } catch {
    // storage blocked: the draft lasts until reload
  }
}

// The wall everyone sees: latest published row, else the files shipped with the app.
async function loadPublished() {
  const w = hasBackend ? await currentWall().catch(() => null) : null;
  if (w) return { version: w.version, photo: w.photo_url, holds: w.holds };
  const f = await fetch('holds.json')
    .then((r) => r.json())
    .then(parseHoldsFile)
    .catch(() => ({ wall: 1, holds: [] }));
  return { version: f.wall, photo: 'wall.jpg', holds: f.holds };
}

export default function App() {
  const [published, setPublished] = useState({ version: null, photo: 'wall.jpg', holds: [] });
  const [draft, setDraftState] = useState(readDraft);
  const [route, setRoute] = useState(() => decode(startHash()));
  // Plain visit (no route link) lands on the shared list; a route link opens that route.
  const [mode, setMode] = useState(() =>
    hasBackend && !Object.keys(route.holds).length ? 'list' : 'route',
  );
  const [sel, setSel] = useState(null);
  const [size, setSize] = useState(18); // radius for new/selected hold, 1/1000 of image width
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(''); // wall setup progress message
  const [user, setUser] = useState(null); // Google account, needed for sends
  const [admin, setAdmin] = useState(!hasBackend); // no backend = local dev: everyone maps
  const [scale, setScaleState] = useState(() => readPref('scale', 'font')); // font | v
  const [mine, setMine] = useState({}); // my ascents by route id
  const wall = published.version;
  const setScale = (s) => {
    setScaleState(s);
    writePref('scale', s);
  };
  const setDraft = (d) => {
    setDraftState(d);
    writeDraft(d);
  };
  const onAscent = (id, a) =>
    setMine((m) => {
      const next = { ...m };
      if (a) next[id] = a;
      else delete next[id];
      return next;
    });

  useEffect(() => (hasBackend ? onUser(setUser) : undefined), []);
  useEffect(() => {
    if (!hasBackend) return;
    if (!user) {
      setAdmin(false);
      return setMine({});
    }
    isAdmin(user.id)
      .then(setAdmin)
      .catch(() => setAdmin(false));
    myAscents()
      .then((rows) => setMine(Object.fromEntries(rows.map((a) => [a.route_id, a]))))
      .catch(() => {}); // offline: the list still works, just without ✓ marks
  }, [user]);
  useEffect(() => {
    if (!admin && mode === 'map') setMode('list');
  }, [admin, mode]);

  useEffect(() => {
    loadPublished().then(setPublished);
    const onHash = () => setRoute(decode(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const updateRoute = (r) => {
    setRoute(r);
    history.replaceState(null, '', '#' + encode(r));
  };
  // Any edit makes it a new, unsaved route (the shared list has no edit yet).
  const editRoute = (r) => updateRoute({ ...r, id: null });
  useEffect(() => {
    if (!location.hash && Object.keys(route.holds).length) updateRoute(route); // restored after sign-in
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wall setup edits the draft (created from the published wall on first edit).
  const updateHolds = (fn) =>
    setDraftState((prev) => {
      const base = prev ?? { photo: null, holds: published.holds };
      const next = { ...base, holds: fn(base.holds) };
      writeDraft(next);
      return next;
    });
  const shown =
    mode === 'map' && draft
      ? { photo: draft.photo ?? published.photo, holds: draft.holds }
      : published;

  function onTap(id, p) {
    if (mode === 'route') {
      setSel(id === sel ? null : id); // opens/closes the type picker
    } else if (id != null) {
      setSel(id);
      setSize(Math.round(shown.holds.find((h) => h.id === id).r * 1000));
    } else {
      // ids are never reused, so an old route can't silently point at a different hold
      const h = {
        id: nextId([...published.holds, ...shown.holds]),
        x: clamp01(p.x),
        y: clamp01(p.y),
        r: size / 1000,
      };
      updateHolds((hs) => [...hs, h]);
      setSel(h.id);
    }
  }
  function setRole(r) {
    const roles = { ...route.holds };
    if (r) roles[sel] = r;
    else delete roles[sel];
    editRoute({ ...route, wall, holds: roles });
    setSel(null);
  }
  const onDrag = (id, x, y) =>
    updateHolds((hs) => hs.map((h) => (h.id === id ? { ...h, x, y } : h)));
  function resize(v) {
    setSize(v);
    updateHolds((hs) => hs.map((h) => (h.id === sel ? { ...h, r: v / 1000 } : h)));
  }
  function resetAll() {
    if (!confirm(`Delete all ${shown.holds.length} holds? This cannot be undone.`)) return;
    updateHolds(() => []);
    setSel(null);
  }
  async function changePhoto(file) {
    if (!file) return;
    const holds = (draft ?? published).holds;
    if (!hasBackend) return setDraft({ holds, photo: URL.createObjectURL(file) });
    setBusy('Uploading photo…');
    try {
      setDraft({ holds, photo: await uploadPhoto(await shrinkPhoto(file)) });
    } catch (e) {
      alert(`Could not upload the photo: ${e.message}`);
    } finally {
      setBusy('');
    }
  }
  async function publish() {
    // A new photo is a new wall version (old routes get flagged); hold fixes keep the version.
    const version = draft.photo ? (wall ?? 0) + 1 : (wall ?? 1);
    const note = draft.photo
      ? 'This is a new photo, so existing routes will be marked "old wall".'
      : 'Same photo: existing routes keep working.';
    if (!confirm(`Publish ${draft.holds.length} holds for everyone? ${note}`)) return;
    setBusy('Publishing…');
    try {
      const w = await publishWall({
        version,
        photo_url: draft.photo ?? published.photo,
        holds: draft.holds,
      });
      setPublished({ version: w.version, photo: w.photo_url, holds: w.holds });
      setDraft(null);
      setSel(null);
    } catch (e) {
      alert(`Could not publish: ${e.message}`);
    } finally {
      setBusy('');
    }
  }
  function discard() {
    if (!confirm('Throw away your unpublished wall changes?')) return;
    setDraft(null);
    setSel(null);
  }
  async function share(e) {
    const url = location.href;
    if (navigator.share)
      return navigator.share({ title: route.name || 'Spray wall route', url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    const b = e.currentTarget;
    b.textContent = 'Copied!';
    setTimeout(() => (b.textContent = 'Share'), 1500);
  }

  async function save() {
    if (!Object.keys(route.holds).length) return alert('Mark some holds first.');
    let name = route.name.trim();
    if (!name) name = (prompt('Route name?') ?? '').trim();
    if (!name) return;
    const setter = prompt('Your name (shown as setter)', readPref('setter', ''));
    if (setter === null) return;
    writePref('setter', setter.trim());
    const r = { ...route, wall, name: name.slice(0, 60) };
    setSaving(true);
    try {
      const row = await saveRoute({
        wall: r.wall,
        name: r.name,
        difficulty: r.difficulty,
        setter: setter.trim().slice(0, 40) || null,
        feet: r.feet,
        holds: r.holds,
      });
      updateRoute({ ...r, id: row.id });
    } catch (e) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }
  function openRoute(row) {
    updateRoute({
      id: row.id,
      wall: row.wall,
      name: row.name,
      difficulty: row.difficulty,
      feet: row.feet,
      holds: row.holds,
    });
    setMode('route');
    setSel(null);
  }
  const isSaved = route.id != null;

  const oldWall = wall && route.wall !== wall && Object.keys(route.holds).length > 0;
  const tabs = [['list', 'Routes'], ['route', 'Route'], ...(admin ? [['map', 'Wall setup']] : [])];

  return (
    <>
      <header>
        <nav className="tabs">
          {tabs.map(([m, label]) => (
            <button
              key={m}
              id={`tab-${m}`}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setSel(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {mode === 'list' ? null : mode === 'route' ? (
          <>
            <input
              id="name"
              placeholder="Route name"
              value={route.name}
              onChange={(e) => editRoute({ ...route, name: e.target.value })}
            />
            <select
              id="grade"
              value={gradeLabel(route.difficulty, scale)}
              onChange={(e) =>
                editRoute({
                  ...route,
                  difficulty:
                    gradeOptions(scale).find((o) => o.label === e.target.value)?.value ?? null,
                })
              }
            >
              <option value="">Grade</option>
              {gradeOptions(scale).map((o) => (
                <option key={o.label}>{o.label}</option>
              ))}
            </select>
            {hasBackend && (
              <button id="save" onClick={save} disabled={saving || isSaved}>
                {saving ? 'Saving…' : isSaved ? 'Saved ✓' : 'Save'}
              </button>
            )}
            <button id="share" onClick={share}>
              Share
            </button>
            <button
              id="clear"
              onClick={() =>
                updateRoute({ wall, name: '', difficulty: null, feet: 'm', holds: {} })
              }
            >
              Clear
            </button>
            <select
              id="feet"
              value={route.feet}
              onChange={(e) => editRoute({ ...route, feet: e.target.value })}
            >
              {Object.entries(FEET).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <span className="legend">
              {[
                ['s', 'Start'],
                ['h', 'Hand+foot'],
                ['f', 'Foot only'],
                ['t', 'Top'],
              ].map(([r, label]) => (
                <span key={r}>
                  <i className={r} />
                  {label}
                </span>
              ))}
            </span>
          </>
        ) : (
          <>
            hold size
            <input
              id="size"
              type="range"
              min="5"
              max="80"
              value={size}
              onChange={(e) => resize(+e.target.value)}
            />
            <button
              id="del"
              disabled={sel == null}
              onClick={() => {
                updateHolds((hs) => hs.filter((h) => h.id !== sel));
                setSel(null);
              }}
            >
              Delete
            </button>
            <button id="reset" onClick={resetAll}>
              Reset all
            </button>
            <span id="count">{shown.holds.length} holds</span>
            <label className="file" title="Use a new, straight-on wall photo">
              Photo
              <input
                id="photo"
                type="file"
                accept="image/*"
                hidden
                disabled={!!busy}
                onChange={(e) => changePhoto(e.target.files[0])}
              />
            </label>
            {hasBackend && (
              <button id="publish" disabled={!draft || !!busy} onClick={publish}>
                Publish
              </button>
            )}
            {draft && (
              <button id="discard" disabled={!!busy} onClick={discard}>
                Discard
              </button>
            )}
          </>
        )}
      </header>
      {mode === 'list' ? (
        hasBackend ? (
          <RouteList
            wall={wall}
            scale={scale}
            setScale={setScale}
            mine={mine}
            onOpen={openRoute}
            account={
              <span className="account">
                {user ? (
                  <>
                    {user.user_metadata?.full_name || user.email}{' '}
                    <button id="signout" onClick={() => signOut()}>
                      Sign out
                    </button>
                  </>
                ) : (
                  <button id="signin" onClick={() => signIn()}>
                    Sign in with Google
                  </button>
                )}
              </span>
            }
          />
        ) : (
          <p className="msg">The shared route list is not connected yet.</p>
        )
      ) : (
        <>
          {mode === 'route' && hasBackend && isSaved && (
            <Ascent
              key={route.id}
              routeId={route.id}
              user={user}
              mine={mine[route.id]}
              scale={scale}
              onChange={onAscent}
            />
          )}
          <p className="hint">
            {mode === 'route'
              ? 'Tap a hold, then pick its type below.'
              : busy ||
                (draft
                  ? `Draft: climbers still see the published wall until you press Publish.`
                  : `Published wall (version ${wall}). Tap to add or select a hold, drag the selected (cyan) one.`)}
          </p>
          {oldWall && (
            <p className="warn">
              This route was set on wall version {route.wall}; the wall has been remapped since, so
              holds may not match.
            </p>
          )}
          <Wall
            src={shown.photo}
            holds={shown.holds}
            roles={mode === 'route' ? route.holds : {}}
            sel={sel}
            mode={mode}
            onTap={onTap}
            onDrag={onDrag}
          />
          {mode === 'route' && sel != null && (
            <div className="picker">
              {[
                ['s', 'Start'],
                ['h', 'Hand+foot'],
                ['f', 'Foot only'],
                ['t', 'Top'],
                [null, 'Off'],
              ].map(([r, label]) => (
                <button
                  key={label}
                  id={`role-${r ?? 'off'}`}
                  className={r ?? undefined}
                  aria-pressed={(route.holds[sel] ?? null) === r}
                  onClick={() => setRole(r)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
