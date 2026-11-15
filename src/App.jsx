import { useEffect, useState } from 'react';
import Wall from './components/Wall.jsx';
import { decode, encode, nextRole } from './lib/route.js';
import { clamp01, nextId, parseHoldsFile } from './lib/holds.js';

// In-progress hold mapping is kept per wall version in this browser until exported.
const storeKey = (wall) => `holds-w${wall}`;
function readLocal(wall) {
  try {
    // 'holds' = key used before wall versioning; it can only belong to wall 1
    const raw =
      localStorage.getItem(storeKey(wall)) ?? (wall === 1 ? localStorage.getItem('holds') : null);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [wall, setWall] = useState(null); // hold-map version from holds.json
  const [holds, setHolds] = useState([]);
  const [route, setRoute] = useState(() => decode(location.hash));
  const [mode, setMode] = useState('route');
  const [sel, setSel] = useState(null);
  const [size, setSize] = useState(18); // radius for new/selected hold, 1/1000 of image width
  const [photo, setPhoto] = useState('wall.jpg');

  useEffect(() => {
    fetch('holds.json')
      .then((r) => r.json())
      .then(parseHoldsFile)
      .catch(() => ({ wall: 1, holds: [] }))
      .then((f) => {
        setWall(f.wall);
        setHolds(readLocal(f.wall) ?? f.holds);
      });
    const onHash = () => setRoute(decode(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const updateRoute = (r) => {
    setRoute(r);
    history.replaceState(null, '', '#' + encode(r));
  };
  const updateHolds = (fn) =>
    setHolds((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(storeKey(wall), JSON.stringify(next));
      } catch {
        // storage blocked (private mode): edits stay in memory until reload
      }
      return next;
    });

  function onTap(id, p) {
    if (mode === 'route') {
      if (id == null) return;
      const roles = { ...route.holds };
      const r = nextRole(roles[id]);
      if (r) roles[id] = r;
      else delete roles[id];
      updateRoute({ ...route, wall, holds: roles });
    } else if (id == null) {
      const h = { id: nextId(holds), x: clamp01(p.x), y: clamp01(p.y), r: size / 1000 };
      updateHolds((hs) => [...hs, h]);
      setSel(h.id);
    }
  }
  function onSelect(id) {
    setSel(id);
    const h = holds.find((x) => x.id === id);
    if (h) setSize(Math.round(h.r * 1000));
  }
  const onDrag = (id, x, y) =>
    updateHolds((hs) => hs.map((h) => (h.id === id ? { ...h, x, y } : h)));
  function resize(v) {
    setSize(v);
    updateHolds((hs) => hs.map((h) => (h.id === sel ? { ...h, r: v / 1000 } : h)));
  }
  function resetAll() {
    if (!confirm(`Delete all ${holds.length} holds? This cannot be undone.`)) return;
    updateHolds(() => []);
    setSel(null);
  }
  function exportHolds() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify({ wall, holds })], { type: 'application/json' }),
    );
    a.download = 'holds.json';
    a.click();
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

  const oldWall = wall && route.wall !== wall && Object.keys(route.holds).length > 0;

  return (
    <>
      <header>
        <select
          id="mode"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setSel(null);
          }}
        >
          <option value="route">Route</option>
          <option value="map">Map holds</option>
        </select>
        {mode === 'route' ? (
          <>
            <input
              id="name"
              placeholder="Route name"
              value={route.name}
              onChange={(e) => updateRoute({ ...route, name: e.target.value })}
            />
            <input
              id="grade"
              placeholder="Grade"
              value={route.grade}
              onChange={(e) => updateRoute({ ...route, grade: e.target.value })}
            />
            <button id="share" onClick={share}>
              Share
            </button>
            <button
              id="clear"
              onClick={() => updateRoute({ wall, name: '', grade: '', holds: {} })}
            >
              Clear
            </button>
            <span className="legend">
              <span className="s">start</span>
              <span className="h">hand</span>
              <span className="f">foot</span>
              <span className="t">top</span>
            </span>
          </>
        ) : (
          <>
            size
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
            <span id="count">{holds.length} holds</span>
            <button id="export" onClick={exportHolds}>
              Export holds.json
            </button>
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) =>
                e.target.files[0] && setPhoto(URL.createObjectURL(e.target.files[0]))
              }
            />
          </>
        )}
      </header>
      {oldWall && (
        <p className="warn">
          This route was set on wall version {route.wall}; the wall has been remapped since, so
          holds may not match.
        </p>
      )}
      <Wall
        src={photo}
        holds={holds}
        roles={mode === 'route' ? route.holds : {}}
        sel={sel}
        mode={mode}
        onTap={onTap}
        onSelect={onSelect}
        onDrag={onDrag}
      />
    </>
  );
}
