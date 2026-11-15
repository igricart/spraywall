import { useEffect, useRef, useState } from 'react';
import Panzoom from '@panzoom/panzoom';
import { clamp01, nearest } from '../lib/holds.js';

const HALO_PX = 25; // finger-sized hit area around each hold
const TAP_SLOP_PX = 8; // finger jitter that still counts as a tap

// Wall photo + hold circles. Gestures:
//   pinch / wheel / +- buttons -> zoom the wall,  drag -> pan the wall,  tap -> onTap(holdId|null)
//   map mode only: drag that STARTS on the selected hold moves it (intercepted before panzoom).
// Only the selected hold is draggable, so pinches over a crowded wall always zoom.
export default function Wall({ src, holds, roles, sel, mode, onTap, onDrag }) {
  const [size, setSize] = useState(null); // natural image size in px
  const viewRef = useRef(null);
  const paneRef = useRef(null);
  const svgRef = useRef(null);
  const pzRef = useRef(null);
  const live = useRef(null); // latest props for the native listeners below
  live.current = { holds, sel, mode, onTap, onDrag, aspect: size ? size.h / size.w : 1 };

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  useEffect(() => {
    const view = viewRef.current;
    const pz = Panzoom(paneRef.current, { minScale: 1, maxScale: 6, contain: 'outside' });
    pzRef.current = pz;

    // Pointer -> normalized image coords. getBoundingClientRect already includes the zoom.
    const pt = (e) => {
      const r = svgRef.current.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
        halo: HALO_PX / r.width,
      };
    };
    const hit = (p) => nearest(live.current.holds, p, p.halo, live.current.aspect);

    let g = null; // current one-finger gesture
    const down = (e) => {
      if (e.target.closest('.zoom')) return; // zoom buttons are not wall taps
      if (g) {
        g.moved = true; // second finger = pinch, never a tap
        g.h = null; // and stop dragging the hold
        return;
      }
      const p = pt(e);
      const { mode, sel, holds, aspect } = live.current;
      const selected = mode === 'map' ? holds.filter((h) => h.id === sel) : [];
      const h = nearest(selected, p, p.halo, aspect);
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, h, moved: false };
      if (h) {
        g.dx = h.x - p.x;
        g.dy = h.y - p.y;
        e.stopPropagation(); // keep panzoom from panning
      }
    };
    const move = (e) => {
      if (!g || e.pointerId !== g.id) return;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP_PX) return;
      g.moved = true;
      if (g.h) {
        e.stopPropagation();
        const p = pt(e);
        live.current.onDrag(g.h.id, clamp01(p.x + g.dx), clamp01(p.y + g.dy));
      }
    };
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      if (s.moved) return; // pan, pinch or hold drag
      const p = pt(e);
      live.current.onTap(hit(p)?.id ?? null, p);
    };
    const cancel = () => (g = null);

    view.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    view.addEventListener('wheel', pz.zoomWithWheel);
    return () => {
      view.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      view.removeEventListener('wheel', pz.zoomWithWheel);
      pz.destroy();
    };
  }, []);

  // Fit the whole wall on screen on desktop; full width on phones.
  const fit = size ? { maxWidth: `calc((100dvh - 9rem) * ${size.w / size.h})` } : undefined;

  return (
    <div className="view" ref={viewRef} style={fit}>
      <div ref={paneRef}>
        <svg ref={svgRef} className={mode} viewBox={size ? `0 0 ${size.w} ${size.h}` : '0 0 4 3'}>
          {size && <image href={src} width={size.w} height={size.h} />}
          {size &&
            holds.map((h) => (
              <circle
                key={h.id}
                cx={h.x * size.w}
                cy={h.y * size.h}
                r={h.r * size.w}
                className={[roles[h.id], h.foot && 'fo', h.id === sel && 'sel']
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
        </svg>
      </div>
      <div className="zoom">
        <button id="zout" onClick={() => pzRef.current.zoomOut()}>
          −
        </button>
        <button id="zin" onClick={() => pzRef.current.zoomIn()}>
          +
        </button>
      </div>
    </div>
  );
}
