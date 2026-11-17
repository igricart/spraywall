# Spray Wall – context for Claude

Free web app for one climbing gym's **spray wall**: a photo of the wall, climbers mark a route's holds
as circles, save and share routes, log sends, vote grades. Owner: igricart (not a frontend dev; tests on
an **Android** phone; wants simple, free, conventional). Live: https://igricart.github.io/spraywall/

Read `docs/SPEC.md` first — it is the agreed behaviour. Change it (with the owner) before changing behaviour.

## Model (decided, don't revisit without the owner)

- **Model B:** every route carries its own circles `{x, y, r, t}` (0–1 of the photo; `t` = `s` start,
  `h` hand+foot, `f` foot only, `t` top). There is **no shared hold map / admin / Wall setup** — those
  were built and removed because they confused the owner and were vandalism-prone.
- Nothing reaches the DB until **Save**; before that a route lives in the page and its URL hash.
- Permissions: anyone browses and **creates** routes (no login). **Signed in (Google)**: update/delete
  any route, log sends/votes, change the wall photo. Creator isn't tracked, so every update/delete is
  copied to `route_backups` by a DB trigger first.
- Grades are one number: index into the Font scale (`src/lib/grades.js`). Each phone shows Font or V;
  V votes that span two Font grades are stored as the midpoint. Consensus = median(setter grade + votes),
  computed in the `routes_with_stats` view.
- Wall photo is versioned (`walls` table, else bundled `public/wall.jpg` + `public/holds.json` `{wall}`);
  routes on an older version show "old wall".
- Everything must stay **free** (GitHub Pages, Supabase free tier, Google OAuth without billing).

## Stack & layout

Vite + React 18 (plain JS), `@panzoom/panzoom`, `@supabase/supabase-js`. No router, no state library.

```
src/App.jsx              screens: list / view / set, save form, account/confirm sheets, toasts
src/components/Wall.jsx  photo + circles; panzoom; own touch handling (tap, drag selected circle)
src/components/RouteList.jsx, Ascent.jsx (send form), Tape.jsx (route name on tape)
src/lib/                 pure logic + Vitest: route.js (URL hash format), grades.js, holds.js, photo.js, api.js
src/index.css            design tokens on :root; dark theme via [data-theme]
supabase/migrations/     0001…0005, applied in order (see below)
tests/e2e.mjs            Playwright, Pixel 7 emulation, mocks Supabase/OAuth/storage routes
docs/SPEC.md             agreed behaviour
```

Route link: `#i=<id>&w=<wall>&n=<name>&d=<difficulty>&ft=<feet>&c=x.y.r<t>_…` (x,y,r in 1/1000).

## Commands

`npm run dev` · `npm run lint` · `npm run format` / `format:check` · `npm test` (Vitest) ·
`npm run build` · `npm run test:e2e` (needs `build` first and `npx playwright install chromium` once).
CI (`.github/workflows/deploy.yml`) runs lint, format check, unit, build, e2e on every PR; push to
`master` deploys to GitHub Pages.

## Database (Supabase project `tbnqufcglumnhegnoxki`)

- `.env` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable key — public by design;
  RLS decides what it allows). Never ask for or commit the secret/service_role key or DB password.
- **I can't run SQL.** New migration → add `supabase/migrations/000N_*.sql`, give the owner the SQL to
  paste into Supabase → SQL Editor, and **verify via the REST API** with the publishable key afterwards
  (tables exist, constraints reject bad rows, anonymous deletes blocked) before merging app code that
  depends on it. Prefer probes that don't leave rows (e.g. insert with an invalid value to prove
  insert is allowed).
- Tables: `routes` (holds jsonb array), `ascents` (one per user per route), `walls`, `route_backups`
  (no policies: dashboard only), view `routes_with_stats`, storage bucket `walls`.
- Free tier pauses after ~1 week idle → "Couldn't load the routes"; owner un-pauses in the dashboard.

## Design ("chalk and tape", from Anthropic's frontend-design guide)

Calm frame so the photo carries colour. One bold element: route name on painter's tape
(Permanent Marker) coloured by difficulty band (`tapeBand`). UI font Atkinson Hyperlegible. Dark theme
is the default (Dark / Light / Auto button). Hold colours: start green, hand+foot blue, foot yellow,
top pink. Circles thin (1.5px, 80% opacity) so the hold stays visible. Use in-app toasts and sheets —
no `alert`/`confirm`/`prompt`. 48px tap targets, visible focus, reduced motion respected.

## Gotchas

- Don't give the app root a class equal to an existing component class (`view`, `list`): screen class
  is `mode-<screen>` for this reason.
- `:where(...)` is used where a type-colour class must win over a generic rule.
- Hold drags: only the **selected** circle drags; everything else pans/pinches (otherwise pinches
  on a crowded wall grab holds).
- e2e: hash/DB assertions should allow small positional drift; mocked Supabase lives at the top of
  `tests/e2e.mjs` — extend it when adding API calls.
- Look at screenshots (Playwright, Pixel 7) after any visual change; CSS clashes don't fail tests.

## Workflow the owner expects

Branch → PR → CI green → **ask before merging** unless the owner said "merge"/"make it live" →
after deploy, smoke-test the live site. Explain in plain terms; the owner may not know frontend jargon.

## Open ideas (not built)

QR poster + PWA icon/"Add to Home screen"; hold contour outlines instead of circles (auto-trace on
tap); names next to sends; setter accounts.
