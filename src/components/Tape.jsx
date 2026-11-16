import { tapeBand } from '../lib/grades.js';

// A strip of painter's tape with the route name in marker, coloured by difficulty band.
export default function Tape({ difficulty, children, id }) {
  return (
    <span id={id} className={`tape tape-${tapeBand(difficulty)}`}>
      {children}
    </span>
  );
}
