import { useEffect, useState } from 'react';
import { listRoutes } from '../lib/api.js';
import { SCALES, gradeLabel, gradeOptions } from '../lib/grades.js';

export default function RouteList({ wall, scale, setScale, mine, onOpen, account }) {
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState(null);
  const [grade, setGrade] = useState('');
  const [sent, setSent] = useState('all');

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
    return (
      <p className="msg">No routes yet. Create one in the Route tab and press Save. {account}</p>
    );

  const shownGrade = (r) => gradeLabel(r.consensus ?? r.difficulty, scale);
  const present = new Set(routes.map(shownGrade));
  const grades = gradeOptions(scale)
    .map((o) => o.label)
    .filter((g) => present.has(g));
  const shown = routes.filter(
    (r) =>
      (!grade || shownGrade(r) === grade) &&
      (sent === 'all' || (sent === 'mine') === Boolean(mine[r.id])),
  );

  return (
    <div className="list">
      <div className="filters">
        <span className="tabs">
          {Object.entries(SCALES).map(([k, label]) => (
            <button
              key={k}
              id={`scale-${k}`}
              aria-pressed={scale === k}
              onClick={() => {
                setScale(k);
                setGrade('');
              }}
            >
              {label}
            </button>
          ))}
        </span>
        <select id="grade-filter" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select id="sent-filter" value={sent} onChange={(e) => setSent(e.target.value)}>
          <option value="all">All ({routes.length})</option>
          <option value="mine">My sends</option>
          <option value="todo">Not sent yet</option>
        </select>
        {account}
      </div>
      <ul>
        {shown.map((r) => {
          const set = gradeLabel(r.difficulty, scale);
          return (
            <li key={r.id}>
              <button onClick={() => onOpen(r)}>
                <b>{r.name}</b> <span className="grade">{shownGrade(r)}</span>
                {mine[r.id] && <span className="sent"> ✓</span>}
                <small>
                  {r.votes > 1 &&
                    `${r.votes} votes${set && set !== shownGrade(r) ? `, set as ${set}` : ''} · `}
                  {r.sends > 0 && `${r.sends} send${r.sends > 1 ? 's' : ''} · `}
                  {r.rating && `${'★'.repeat(Math.round(r.rating))} · `}
                  {r.setter && `by ${r.setter} · `}
                  {new Date(r.created_at).toLocaleDateString()}
                  {r.wall !== wall && ' · old wall'}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
