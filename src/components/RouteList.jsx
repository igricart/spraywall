import { useEffect, useState } from 'react';
import { listRoutes } from '../lib/api.js';
import { SCALES, gradeLabel, gradeOptions } from '../lib/grades.js';
import Tape from './Tape.jsx';

export default function RouteList({ wall, scale, setScale, mine, onOpen, onNew }) {
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
      <div className="empty">
        <p>Couldn't load the routes: {error}</p>
        <button className="primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  if (!routes) return <p className="empty">Loading routes…</p>;
  if (!routes.length)
    return (
      <div className="empty">
        <p>No routes on the wall yet.</p>
        <button id="first-route" className="primary" onClick={onNew}>
          Set the first one
        </button>
      </div>
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
    <>
      <div className="filters">
        <span className="segmented" role="group" aria-label="Grade scale">
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
        <select
          id="grade-filter"
          aria-label="Grade"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          id="sent-filter"
          aria-label="Sends"
          value={sent}
          onChange={(e) => setSent(e.target.value)}
        >
          <option value="all">All routes ({routes.length})</option>
          <option value="mine">My sends</option>
          <option value="todo">Not sent yet</option>
        </select>
      </div>
      {!shown.length && <p className="empty">No routes match these filters.</p>}
      <ul className="list">
        {shown.map((r) => {
          const set = gradeLabel(r.difficulty, scale);
          const g = shownGrade(r);
          return (
            <li key={r.id}>
              <button onClick={() => onOpen(r)}>
                <span className="grade">{g || '?'}</span>
                <span className="body">
                  <Tape difficulty={r.consensus ?? r.difficulty}>{r.name}</Tape>
                  <span className="meta">
                    {mine[r.id] && <span className="sent">✓ sent</span>}
                    {r.sends > 0 && (
                      <span>
                        {r.sends} send{r.sends > 1 ? 's' : ''}
                      </span>
                    )}
                    {r.rating && <span>{'★'.repeat(Math.round(r.rating))}</span>}
                    {r.votes > 1 && (
                      <span>
                        {r.votes} votes{set && set !== g ? `, set as ${set}` : ''}
                      </span>
                    )}
                    {r.setter && <span>by {r.setter}</span>}
                    {r.wall !== wall && <span className="old">old wall</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
