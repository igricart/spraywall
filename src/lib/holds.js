// Holds are {id, x, y, r}: x,y as 0..1 of image width/height, r as 0..1 of image width.

export const clamp01 = (v) => +Math.min(1, Math.max(0, v)).toFixed(4);

// holds.json is {wall, holds}. A bare array is the pre-versioning format = wall 1.
export const parseHoldsFile = (json) =>
  Array.isArray(json) ? { wall: 1, holds: json } : { wall: json.wall, holds: json.holds };

// Nearest hold under point p (normalized). A hold counts as hit inside its circle or a
// finger-sized halo (also in image-width units). aspect = image height / width, so distances
// are measured in true image proportions.
export function nearest(holds, p, halo, aspect) {
  let best = null;
  let bestD = Infinity;
  for (const h of holds) {
    const d = Math.hypot(h.x - p.x, (h.y - p.y) * aspect);
    if (d <= Math.max(h.r, halo) && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
