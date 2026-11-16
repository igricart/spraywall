import { useState } from 'react';
import { logAscent, removeAscent, signIn } from '../lib/api.js';
import { gradeLabel, gradeOptions } from '../lib/grades.js';

// "Sent it" for a saved route: optional grade vote (feeds the consensus) + 1-3 stars.
export default function Ascent({ routeId, user, mine, scale, onChange, notify }) {
  const [open, setOpen] = useState(false);
  const [vote, setVote] = useState(mine?.difficulty ?? null);
  const [stars, setStars] = useState(mine?.rating ?? null);
  const [busy, setBusy] = useState(false);

  async function run(fn, done) {
    setBusy(true);
    try {
      onChange(routeId, await fn());
      setOpen(false);
      notify(done);
    } catch (e) {
      notify(`Couldn't save your send: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!user)
    return (
      <button id="sent" className="primary grow" onClick={() => signIn()}>
        Sign in to log
      </button>
    );

  if (!open)
    return (
      <button
        id="sent"
        className={mine ? 'done grow' : 'primary grow'}
        onClick={() => setOpen(true)}
      >
        {mine
          ? `✓ Sent${mine.difficulty != null ? `, you voted ${gradeLabel(mine.difficulty, scale)}` : ''}`
          : 'Sent it ✓'}
      </button>
    );

  const options = gradeOptions(scale);
  return (
    <div className="sheet" role="dialog" aria-label="Log your send">
      <h2>{mine ? 'Your send' : 'Log your send'}</h2>
      <label className="field">
        How hard did it feel?
        <select
          id="vote"
          value={gradeLabel(vote, scale)}
          onChange={(e) => setVote(options.find((o) => o.label === e.target.value)?.value ?? null)}
        >
          <option value="">No vote</option>
          {options.map((o) => (
            <option key={o.label}>{o.label}</option>
          ))}
        </select>
      </label>
      <div className="field">
        How good is it?
        <span className="stars">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              id={`star-${n}`}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={stars >= n}
              onClick={() => setStars(stars === n ? null : n)}
            >
              ★
            </button>
          ))}
        </span>
      </div>
      <div className="actions">
        <button
          id="log"
          className="primary"
          disabled={busy}
          onClick={() =>
            run(
              () => logAscent({ route_id: routeId, difficulty: vote, rating: stars }),
              mine ? 'Send updated' : 'Send logged',
            )
          }
        >
          {mine ? 'Update send' : 'Log send'}
        </button>
        {mine && (
          <button
            id="unsend"
            className="danger"
            disabled={busy}
            onClick={() => run(() => removeAscent(routeId).then(() => null), 'Send removed')}
          >
            Remove send
          </button>
        )}
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
