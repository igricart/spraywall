import { useEffect, useState } from 'react';
import Wall from './components/Wall.jsx';
import RouteList from './components/RouteList.jsx';
import Ascent from './components/Ascent.jsx';
import {
  RETURN_KEY,
  currentWall,
  deleteRoute,
  hasBackend,
  myAscents,
  newWallVersion,
  onUser,
  saveRoute,
  signIn,
  signOut,
  updateRoute as updateRouteRow,
  uploadPhoto,
} from './lib/api.js';
import { gradeLabel, gradeOptions } from './lib/grades.js';
import { FEET, decode, encode } from './lib/route.js';
import { clamp01, parseHoldsFile } from './lib/holds.js';
import { shrinkPhoto } from './lib/photo.js';

// Model B (docs/SPEC.md): every route carries its own circles {x, y, r, t}. Nothing reaches the
// database until Save; until then the route lives in this page and its link.

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

// Current wall photo: latest uploaded version, else the photo shipped with the app.
async function loadWall() {
  const f = await fetch('holds.json')
    .then((r) => r.json())
    .then(parseHoldsFile)
    .catch(() => ({ wall: 1 }));
  const w = hasBackend ? await currentWall().catch(() => null) : null;
  return w ? { version: w.version, photo: w.photo_url } : { version: f.wall, photo: 'wall.jpg' };
}

const TYPES = [
  ['s', 'Start'],
  ['h', 'Hand+foot'],
  ['f', 'Foot only'],
  ['t', 'Top'],
];
const EMPTY = { name: '', difficulty: null, feet: 'm', holds: [] };

export default function App() {
  const [wallState, setWallState] = useState({ version: null, photo: 'wall.jpg' });
  const [route, setRoute] = useState(() => decode(startHash()));
  const [editingId, setEditingId] = useState(null); // saved route this one was changed from
  // Plain visit (no route link) lands on the shared list; a route link opens that route.
  const [mode, setMode] = useState(() => (hasBackend && !route.holds.length ? 'list' : 'route'));
  const [sel, setSel] = useState(null); // index of the selected circle
  const [size, setSize] = useState(() => +readPref('circle', 18)); // 1/1000 of photo width
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [user, setUser] = useState(null); // Google account: edit routes, sends, photo
  const [scale, setScaleState] = useState(() => readPref('scale', 'font')); // font | v
  const [mine, setMine] = useState({}); // my ascents by route id
  const [listKey, setListKey] = useState(0); // bump to reload the route list
  const wall = wallState.version;
  const setScale = (s) => {
    setScaleState(s);
    writePref('scale', s);
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
    if (!user) return setMine({});
    myAscents()
      .then((rows) => setMine(Object.fromEntries(rows.map((a) => [a.route_id, a]))))
      .catch(() => {}); // offline: the list still works, just without ✓ marks
  }, [user]);

  useEffect(() => {
    loadWall().then(setWallState);
    const onHash = () => setRoute(decode(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const showRoute = (r) => {
    setRoute(r);
    history.replaceState(null, '', '#' + encode(r));
  };
  // Any edit makes it unsaved; remember which saved route it came from (signed in: Update it).
  const editRoute = (r) => {
    if (route.id != null) setEditingId(route.id);
    showRoute({ ...r, id: null });
  };
  useEffect(() => {
    if (!location.hash && route.holds.length) showRoute(route); // restored after sign-in
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- circles: tap empty photo = new circle (type picker opens), tap circle = select it.
  // A brand-new route belongs to the current photo; an opened route keeps the photo it was set on.
  const setCircles = (fn) =>
    editRoute({
      ...route,
      wall: route.holds.length ? route.wall : wall,
      holds: fn(route.holds),
    });
  function onTap(i, p) {
    if (i != null) {
      setSel(i === sel ? null : i);
      if (i !== sel) setSize(Math.round(route.holds[i].r * 1000));
      return;
    }
    if (sel != null) return setSel(null); // tap on empty wall first just closes the picker
    const c = { x: clamp01(p.x), y: clamp01(p.y), r: size / 1000, t: 'h' };
    setCircles((cs) => [...cs, c]);
    setSel(route.holds.length);
  }
  const onDrag = (i, x, y) => setCircles((cs) => cs.map((c, j) => (j === i ? { ...c, x, y } : c)));
  const setType = (t) => setCircles((cs) => cs.map((c, j) => (j === sel ? { ...c, t } : c)));
  function resize(v) {
    setSize(v);
    writePref('circle', v);
    setCircles((cs) => cs.map((c, j) => (j === sel ? { ...c, r: v / 1000 } : c)));
  }
  function removeCircle() {
    setCircles((cs) => cs.filter((_, j) => j !== sel));
    setSel(null);
  }

  // ---- wall photo: signed-in only; a new photo is a new wall version
  async function changePhoto(file) {
    if (!file) return;
    if (
      !confirm(
        'Use this as the new wall photo for everyone? Existing routes will be marked "old wall".',
      )
    )
      return;
    setBusy('Uploading photo…');
    try {
      const url = await uploadPhoto(await shrinkPhoto(file));
      const w = await newWallVersion({ version: (wall ?? 0) + 1, photo_url: url });
      setWallState({ version: w.version, photo: w.photo_url });
      setListKey((k) => k + 1);
    } catch (e) {
      alert(`Could not change the photo: ${e.message}`);
    } finally {
      setBusy('');
    }
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

  // ---- routes: anyone creates; signed-in users update or delete (old version backed up)
  const row = (r) => ({
    wall: r.wall ?? wall,
    name: r.name,
    difficulty: r.difficulty,
    feet: r.feet,
    holds: r.holds,
  });
  function ready() {
    if (!route.holds.length) {
      alert('Tap the holds of your route on the photo first.');
      return false;
    }
    if (!route.holds.some((c) => c.t === 's')) {
      alert('Mark at least one Start hold.');
      return false;
    }
    return true;
  }
  async function save() {
    if (!ready()) return;
    let name = route.name.trim();
    if (!name) name = (prompt('Route name?') ?? '').trim();
    if (!name) return;
    const setter = prompt('Your name (shown as setter)', readPref('setter', ''));
    if (setter === null) return;
    writePref('setter', setter.trim());
    const r = { ...route, name: name.slice(0, 60) };
    setSaving(true);
    try {
      const saved = await saveRoute({ ...row(r), setter: setter.trim().slice(0, 40) || null });
      showRoute({ ...r, wall: saved.wall, id: saved.id });
      setEditingId(null);
      setSel(null);
    } catch (e) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }
  async function update() {
    if (!ready()) return;
    if (!route.name.trim()) return alert('The route needs a name.');
    const r = { ...route, name: route.name.trim().slice(0, 60) };
    setSaving(true);
    try {
      const saved = await updateRouteRow(editingId, row(r));
      showRoute({ ...r, id: saved.id });
      setEditingId(null);
      setSel(null);
    } catch (e) {
      alert(`Could not update: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    const id = route.id ?? editingId;
    if (!confirm(`Delete "${route.name || 'this route'}" for everyone? Its sends are deleted too.`))
      return;
    try {
      await deleteRoute(id);
      showRoute({ ...EMPTY, wall });
      setEditingId(null);
      setListKey((k) => k + 1);
      setMode('list');
    } catch (e) {
      alert(`Could not delete: ${e.message}`);
    }
  }
  function openRoute(r) {
    showRoute({
      id: r.id,
      wall: r.wall,
      name: r.name,
      difficulty: r.difficulty,
      feet: r.feet,
      holds: r.holds,
    });
    setEditingId(null);
    setSel(null);
    setMode('route');
  }
  function newRoute() {
    showRoute({ ...EMPTY, wall });
    setEditingId(null);
    setSel(null);
    setMode('route');
  }

  const isSaved = route.id != null;
  const canChange = hasBackend && user && (route.id ?? editingId) != null;
  const oldWall = wall && route.wall !== wall && route.holds.length > 0;
  const account = (
    <span className="account">
      {user ? (
        <>
          {user.user_metadata?.full_name || user.email}{' '}
          <label className="file" title="Use a new, straight-on wall photo">
            {busy || 'Wall photo'}
            <input
              id="photo"
              type="file"
              accept="image/*"
              hidden
              disabled={!!busy}
              onChange={(e) => changePhoto(e.target.files[0])}
            />
          </label>{' '}
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
  );

  return (
    <>
      <header>
        <nav className="tabs">
          <button id="tab-list" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            Routes
          </button>
          <button
            id="tab-route"
            aria-pressed={mode === 'route'}
            onClick={() => {
              setMode('route');
              setSel(null);
            }}
          >
            Route
          </button>
        </nav>
        {mode === 'list' ? (
          <button id="new-route" onClick={newRoute}>
            + New route
          </button>
        ) : (
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
            {hasBackend && (
              <button id="save" onClick={save} disabled={saving || isSaved}>
                {saving ? 'Saving…' : isSaved ? 'Saved ✓' : editingId ? 'Save as new' : 'Save'}
              </button>
            )}
            {canChange && editingId && !isSaved && (
              <button id="update" onClick={update} disabled={saving}>
                Update
              </button>
            )}
            {canChange && (
              <button id="delete-route" onClick={remove}>
                Delete
              </button>
            )}
            <button id="share" onClick={share}>
              Share
            </button>
            <span className="legend">
              {TYPES.map(([t, label]) => (
                <span key={t}>
                  <i className={t} />
                  {label}
                </span>
              ))}
            </span>
          </>
        )}
      </header>
      {mode === 'list' ? (
        hasBackend ? (
          <RouteList
            key={listKey}
            wall={wall}
            scale={scale}
            setScale={setScale}
            mine={mine}
            onOpen={openRoute}
            account={account}
          />
        ) : (
          <p className="msg">The shared route list is not connected yet.</p>
        )
      ) : (
        <>
          {hasBackend && isSaved && (
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
            {editingId && hasBackend && !user
              ? 'You changed a saved route: Save as new, or sign in (Routes tab) to update the original.'
              : route.holds.length
                ? 'Tap a hold to add it, tap a circle to change its type or size, drag the selected circle to move it.'
                : 'Tap each hold of your route on the photo. Pinch or +/− to zoom.'}
          </p>
          {oldWall && (
            <p className="warn">
              This route was set on an older wall photo, so its holds may not match the wall.
            </p>
          )}
          <Wall
            src={wallState.photo}
            circles={route.holds}
            sel={sel}
            onTap={onTap}
            onDrag={onDrag}
          />
          {sel != null && route.holds[sel] && (
            <div className="picker">
              <div className="types">
                {TYPES.map(([t, label]) => (
                  <button
                    key={t}
                    id={`role-${t}`}
                    className={t}
                    aria-pressed={route.holds[sel].t === t}
                    onClick={() => setType(t)}
                  >
                    {label}
                  </button>
                ))}
                <button id="role-off" onClick={removeCircle}>
                  Remove
                </button>
              </div>
              <label className="sizer">
                size
                <input
                  id="size"
                  type="range"
                  min="5"
                  max="80"
                  value={size}
                  onChange={(e) => resize(+e.target.value)}
                />
                <button id="done" onClick={() => setSel(null)}>
                  Done
                </button>
              </label>
            </div>
          )}
        </>
      )}
    </>
  );
}
