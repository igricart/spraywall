import { useState } from 'react';
import { logAscent, removeAscent } from '../lib/api.js';
import { gradeLabel, gradeOptions } from '../lib/grades.js';

// "Sent it" for an opened, saved route: optional grade vote (feeds the consensus) + 1-3 stars.
export default function Ascent({ routeId, mine, scale, onChange }) {
  const [open, setOpen] = useState(false);
  const [vote, setVote] = useState(mine?.difficulty ?? null);
  const [stars, setStars] = useState(mine?.rating ?? null);
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    try {
      onChange(routeId, await fn());
      setOpen(false);
    } catch (e) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="ascent">
        <button id="sent" className={mine ? 'done' : undefined} onClick={() => setOpen(true)}>
          {mine
            ? `✓ Sent${mine.difficulty != null ? ` · voted ${gradeLabel(mine.difficulty, scale)}` : ''} · edit`
            : 'Sent it ✓'}
        </button>
      </div>
    );

  const options = gradeOptions(scale);
  return (
    <div className="ascent">
      <select
        id="vote"
        value={gradeLabel(vote, scale)}
        onChange={(e) => setVote(options.find((o) => o.label === e.target.value)?.value ?? null)}
      >
        <option value="">Your grade (optional)</option>
        {options.map((o) => (
          <option key={o.label}>{o.label}</option>
        ))}
      </select>
      <span className="stars" aria-label="rating">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            id={`star-${n}`}
            aria-pressed={stars >= n}
            onClick={() => setStars(stars === n ? null : n)}
          >
            ★
          </button>
        ))}
      </span>
      <button
        id="log"
        disabled={busy}
        onClick={() => run(() => logAscent({ route_id: routeId, difficulty: vote, rating: stars }))}
      >
        {mine ? 'Update' : 'Log send'}
      </button>
      {mine && (
        <button
          id="unsend"
          disabled={busy}
          onClick={() => run(() => removeAscent(routeId).then(() => null))}
        >
          Remove
        </button>
      )}
      <button onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
