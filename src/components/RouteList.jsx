import { useEffect, useState } from 'react';
import { listRoutes } from '../lib/api.js';

export default function RouteList({ wall, onOpen }) {
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState(null);
  const [grade, setGrade] = useState('');

  function load() {
    setError(null);
    listRoutes()
      .then(setRoutes)
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  if (error)
    return (
      <p className="msg">
        Could not load routes ({error}). <button onClick={load}>Retry</button>
      </p>
    );
  if (!routes) return <p className="msg">Loading routes…</p>;
  if (!routes.length)
    return <p className="msg">No routes yet. Create one in the Route tab and press Save.</p>;

  const grades = [...new Set(routes.map((r) => r.grade).filter(Boolean))].sort();
  const shown = grade ? routes.filter((r) => r.grade === grade) : routes;
  return (
    <div className="list">
      <select id="grade-filter" value={grade} onChange={(e) => setGrade(e.target.value)}>
        <option value="">All grades ({routes.length})</option>
        {grades.map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
      <ul>
        {shown.map((r) => (
          <li key={r.id}>
            <button onClick={() => onOpen(r)}>
              <b>{r.name}</b> <span className="grade">{r.grade}</span>
              <small>
                {r.setter && `by ${r.setter} · `}
                {new Date(r.created_at).toLocaleDateString()} · {Object.keys(r.holds).length} holds
                {r.wall !== wall && ' · old wall'}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
