import { useEffect, useRef, useState } from 'react';
import Wall from './components/Wall.jsx';
import RouteList from './components/RouteList.jsx';
import Ascent from './components/Ascent.jsx';
import Tape from './components/Tape.jsx';
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
// Three screens: the route list, viewing a route, and setting (creating/editing) a route.

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
const EMPTY = { id: null, name: '', difficulty: null, feet: 'm', holds: [] };

export default function App() {
  const [wallState, setWallState] = useState({ version: null, photo: 'wall.jpg' });
  const [route, setRoute] = useState(() => decode(startHash()));
  const [mode, setMode] = useState(() =>
    route.holds.length ? 'view' : hasBackend ? 'list' : 'set',
  );
  const [original, setOriginal] = useState(null); // route as it was before Edit (for Cancel)
  const [editingId, setEditingId] = useState(null); // saved route being edited
  const [sel, setSel] = useState(null); // index of the selected circle
  const [size, setSize] = useState(() => +readPref('circle', 18)); // 1/1000 of photo width
  const [saveOpen, setSaveOpen] = useState(false);
  const [form, setForm] = useState({ name: '', setter: '', problem: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [user, setUser] = useState(null); // Google account: edit routes, sends, photo
  const [accountOpen, setAccountOpen] = useState(false);
  const [scale, setScaleState] = useState(() => readPref('scale', 'font')); // font | v
  const [mine, setMine] = useState({}); // my ascents by route id
  const [listKey, setListKey] = useState(0); // bump to reload the route list
  const [toast, setToast] = useState(null); // { text, kind }
  const [question, setQuestion] = useState(null); // { text, ok, danger, resolve }
  const toastTimer = useRef(null);
  const wall = wallState.version;

  const notify = (text, kind = 'ok') => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2500);
  };
  const ask = (text, ok, danger = false) =>
    new Promise((resolve) => setQuestion({ text, ok, danger, resolve }));
  const answer = (yes) => {
    question.resolve(yes);
    setQuestion(null);
  };
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
    history.replaceState(null, '', r.holds.length ? '#' + encode(r) : location.pathname);
  };
  useEffect(() => {
    if (!location.hash && route.holds.length) showRoute(route); // restored after sign-in
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- screens
  function openRoute(r) {
    showRoute({
      id: r.id,
      wall: r.wall,
      name: r.name,
      difficulty: r.difficulty,
      feet: r.feet,
      holds: r.holds,
    });
    setSel(null);
    setMode('view');
  }
  function newRoute() {
    setOriginal(null);
    setEditingId(null);
    showRoute({ ...EMPTY, wall });
    setSel(null);
    setMode('set');
  }
  function editRoute() {
    setOriginal(route);
    setEditingId(route.id);
    setSel(null);
    setMode('set');
  }
  const dirty =
    mode === 'set' &&
    encode({ ...route, id: null }) !==
      encode({ ...(original ?? EMPTY), id: null, wall: original?.wall ?? route.wall });
  async function leaveSet() {
    if (
      dirty &&
      route.holds.length &&
      !(await ask('Discard your changes to this route?', 'Discard', true))
    )
      return;
    setSel(null);
    setSaveOpen(false);
    if (original) {
      showRoute(original);
      setMode('view');
    } else {
      showRoute({ ...EMPTY, wall });
      setMode(hasBackend ? 'list' : 'set');
    }
  }
  function backToList() {
    showRoute({ ...EMPTY, wall });
    setSel(null);
    setMode('list');
  }

  // ---- circles: tap empty photo = new circle (type bar opens), tap circle = select it.
  // A brand-new route belongs to the current photo; an edited route keeps the photo it was set on.
  const setCircles = (fn) =>
    showRoute({
      ...route,
      id: null,
      wall: route.holds.length ? route.wall : wall,
      holds: fn(route.holds),
    });
  function onTap(i, p) {
    if (mode !== 'set') return;
    if (i != null) {
      setSel(i === sel ? null : i);
      if (i !== sel) setSize(Math.round(route.holds[i].r * 1000));
      return;
    }
    if (sel != null) return setSel(null); // tap on empty wall first just closes the type bar
    const c = { x: clamp01(p.x), y: clamp01(p.y), r: size / 1000, t: 'h' };
    setCircles((cs) => [...cs, c]);
    setSel(route.holds.length);
  }
  const onDrag = (i, x, y) => {
    if (mode === 'set') setCircles((cs) => cs.map((c, j) => (j === i ? { ...c, x, y } : c)));
  };
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
    setAccountOpen(false);
    if (
      !(await ask(
        'Use this photo as the wall for everyone? Existing routes will be marked "old wall".',
        'Use photo',
      ))
    )
      return;
    setBusy('Uploading the photo…');
    try {
      const url = await uploadPhoto(await shrinkPhoto(file));
      const w = await newWallVersion({ version: (wall ?? 0) + 1, photo_url: url });
      setWallState({ version: w.version, photo: w.photo_url });
      setListKey((k) => k + 1);
      notify('Wall photo changed');
    } catch (e) {
      notify(`Couldn't change the photo: ${e.message}`, 'error');
    } finally {
      setBusy('');
    }
  }

  async function share() {
    const url = location.href;
    try {
      if (navigator.share)
        return await navigator.share({ title: route.name || 'Spray wall route', url });
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch {
      // share sheet dismissed
    }
  }

  // ---- saving: anyone creates; signed-in users update or delete (old version backed up)
  function openSave() {
    if (!route.holds.length)
      return notify('Tap the holds of your route on the photo first.', 'error');
    if (!route.holds.some((c) => c.t === 's'))
      return notify('Mark at least one Start hold.', 'error');
    setSel(null);
    setForm({ name: route.name, setter: readPref('setter', ''), problem: '' });
    setSaveOpen(true);
  }
  const row = (r) => ({
    wall: r.wall ?? wall,
    name: r.name,
    difficulty: r.difficulty,
    feet: r.feet,
    holds: r.holds,
  });
  async function submit(asNew) {
    const name = form.name.trim().slice(0, 60);
    if (!name) return setForm({ ...form, problem: 'Give the route a name.' });
    const r = { ...route, name };
    setSaving(true);
    try {
      let saved;
      if (asNew) {
        writePref('setter', form.setter.trim());
        saved = await saveRoute({ ...row(r), setter: form.setter.trim().slice(0, 40) || null });
      } else saved = await updateRouteRow(editingId, row(r));
      showRoute({ ...r, wall: saved.wall, id: saved.id });
      setSaveOpen(false);
      setEditingId(null);
      setOriginal(null);
      setListKey((k) => k + 1);
      setMode('view');
      notify(asNew ? 'Route saved' : 'Route updated');
    } catch (e) {
      setForm({ ...form, problem: `Couldn't save: ${e.message}` });
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    const id = editingId ?? route.id;
    if (
      !(await ask(
        `Delete "${original?.name || route.name}" for everyone? Its sends are deleted too.`,
        'Delete route',
        true,
      ))
    )
      return;
    try {
      await deleteRoute(id);
      setSaveOpen(false);
      setEditingId(null);
      setOriginal(null);
      setListKey((k) => k + 1);
      backToList();
      notify('Route deleted');
    } catch (e) {
      notify(`Couldn't delete: ${e.message}`, 'error');
    }
  }

  const oldWall = wall && route.wall !== wall && route.holds.length > 0;
  const starts = route.holds.filter((c) => c.t === 's').length;
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email;

  return (
    <div className={`app mode-${mode}`}>
      {mode === 'list' && (
        <header className="bar">
          <h1>Spray wall</h1>
          {hasBackend &&
            (user ? (
              <button id="account" className="ghost" onClick={() => setAccountOpen(true)}>
                {firstName}
              </button>
            ) : (
              <button id="signin" className="ghost" onClick={() => signIn()}>
                Sign in
              </button>
            ))}
        </header>
      )}
      {mode === 'view' && (
        <header className="bar">
          <button id="back" className="icon" aria-label="Back to routes" onClick={backToList}>
            ←
          </button>
          <span className="title">
            <Tape id="route-name" difficulty={route.difficulty}>
              {route.name || 'Shared route'}
            </Tape>
          </span>
          <span id="route-grade" className="big-grade">
            {gradeLabel(route.difficulty, scale)}
          </span>
        </header>
      )}
      {mode === 'set' && (
        <header className="bar">
          <button
            id="cancel"
            className="icon"
            aria-label={original ? 'Cancel editing' : 'Back to routes'}
            onClick={leaveSet}
          >
            ←
          </button>
          <span className="title plain">{original ? 'Edit route' : 'New route'}</span>
          {hasBackend && (
            <button id="save" className="primary" onClick={openSave}>
              Save
            </button>
          )}
        </header>
      )}

      <main>
        {mode === 'list' &&
          (hasBackend ? (
            <RouteList
              key={listKey}
              wall={wall}
              scale={scale}
              setScale={setScale}
              mine={mine}
              onOpen={openRoute}
              onNew={newRoute}
            />
          ) : (
            <p className="empty">The shared route list isn't connected.</p>
          ))}

        {mode !== 'list' && (
          <>
            {mode === 'view' && (
              <p className="meta route-meta">
                <span>{FEET[route.feet]}</span>
                <span>{route.holds.length} holds</span>
                {oldWall && (
                  <span className="old">Set on an older wall photo: holds may have moved</span>
                )}
              </p>
            )}
            {mode === 'set' && (
              <p className="hint">
                {route.holds.length
                  ? `${route.holds.length} holds${starts ? '' : ', no Start yet'}. Tap a circle to change it, drag the selected one to move it.`
                  : 'Tap each hold of your route on the photo. Pinch or use − + to zoom.'}
              </p>
            )}
            <Wall
              src={wallState.photo}
              circles={route.holds}
              sel={mode === 'set' ? sel : null}
              onTap={onTap}
              onDrag={onDrag}
            />
          </>
        )}
      </main>

      {mode === 'list' && hasBackend && (
        <footer className="dock">
          <button id="new-route" className="primary grow" onClick={newRoute}>
            Set a new route
          </button>
        </footer>
      )}
      {mode === 'view' && (
        <footer className="dock">
          {hasBackend && route.id != null && (
            <Ascent
              key={route.id}
              routeId={route.id}
              user={user}
              mine={mine[route.id]}
              scale={scale}
              onChange={onAscent}
              notify={notify}
            />
          )}
          <button id="share" onClick={share}>
            Share
          </button>
          <button id="edit" onClick={editRoute}>
            Edit
          </button>
        </footer>
      )}
      {mode === 'set' && (
        <footer className="dock column">
          {sel != null && route.holds[sel] ? (
            <>
              <div className="types" role="group" aria-label="Hold type">
                {TYPES.map(([t, label]) => (
                  <button
                    key={t}
                    id={`role-${t}`}
                    className={`type ${t}`}
                    aria-pressed={route.holds[sel].t === t}
                    onClick={() => setType(t)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="sizer">
                <label htmlFor="size">Size</label>
                <input
                  id="size"
                  type="range"
                  min="5"
                  max="80"
                  value={size}
                  onChange={(e) => resize(+e.target.value)}
                />
                <button id="role-off" className="danger" onClick={removeCircle}>
                  Remove
                </button>
                <button id="done" className="primary" onClick={() => setSel(null)}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <div className="legend" aria-label="Hold types">
              {TYPES.map(([t, label]) => (
                <span key={t}>
                  <i className={t} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </footer>
      )}

      {saveOpen && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setSaveOpen(false)}>
          <form
            className="sheet"
            aria-label="Save route"
            onSubmit={(e) => {
              e.preventDefault();
              submit(!(editingId && user));
            }}
          >
            <h2>{editingId ? 'Save your changes' : 'Save route'}</h2>
            <label className="field">
              Name
              <input
                id="name"
                autoFocus
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, problem: '' })}
              />
            </label>
            <div className="row">
              <label className="field">
                Grade
                <select
                  id="grade"
                  value={gradeLabel(route.difficulty, scale)}
                  onChange={(e) =>
                    showRoute({
                      ...route,
                      id: null,
                      difficulty:
                        gradeOptions(scale).find((o) => o.label === e.target.value)?.value ?? null,
                    })
                  }
                >
                  <option value="">Not sure</option>
                  {gradeOptions(scale).map((o) => (
                    <option key={o.label}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Feet
                <select
                  id="feet"
                  value={route.feet}
                  onChange={(e) => showRoute({ ...route, id: null, feet: e.target.value })}
                >
                  {Object.entries(FEET).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!(editingId && user) && (
              <label className="field">
                Your name (shown as setter)
                <input
                  id="setter"
                  maxLength={40}
                  value={form.setter}
                  onChange={(e) => setForm({ ...form, setter: e.target.value })}
                />
              </label>
            )}
            {editingId && !user && (
              <p className="note">
                Editing someone's route? It's saved as a new route. Sign in to change the original.
              </p>
            )}
            {form.problem && (
              <p className="problem" role="alert">
                {form.problem}
              </p>
            )}
            <div className="actions">
              {editingId && user ? (
                <>
                  <button id="update" type="submit" className="primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Update route'}
                  </button>
                  <button
                    id="save-new"
                    type="button"
                    disabled={saving}
                    onClick={() => submit(true)}
                  >
                    Save as new
                  </button>
                  <button id="delete-route" type="button" className="danger" onClick={remove}>
                    Delete route
                  </button>
                </>
              ) : (
                <button id="save-new" type="submit" className="primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save route'}
                </button>
              )}
              <button type="button" onClick={() => setSaveOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {accountOpen && (
        <div
          className="scrim"
          onClick={(e) => e.target === e.currentTarget && setAccountOpen(false)}
        >
          <div className="sheet" role="dialog" aria-label="Account">
            <h2>{user?.user_metadata?.full_name || user?.email}</h2>
            <p className="note">
              Signed in: you can log sends, edit or delete routes, and change the wall photo.
            </p>
            <div className="actions">
              <label className="button" htmlFor="photo">
                {busy || 'Change wall photo'}
              </label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                hidden
                disabled={!!busy}
                onChange={(e) => changePhoto(e.target.files[0])}
              />
              <button
                id="signout"
                onClick={() => {
                  setAccountOpen(false);
                  signOut();
                }}
              >
                Sign out
              </button>
              <button onClick={() => setAccountOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {question && (
        <div className="scrim">
          <div className="sheet" role="alertdialog" aria-label="Confirm">
            <p>{question.text}</p>
            <div className="actions">
              <button
                id="ask-ok"
                autoFocus
                className={question.danger ? 'danger' : 'primary'}
                onClick={() => answer(true)}
              >
                {question.ok}
              </button>
              <button id="ask-cancel" onClick={() => answer(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast?.kind ?? ''}`} role="status" aria-live="polite">
        {toast?.text}
      </div>
      {busy && !accountOpen && <div className="toast">{busy}</div>}
    </div>
  );
}
