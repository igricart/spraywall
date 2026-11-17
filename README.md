# Spray Wall

Wall photo + tappable hold overlay for a gym spray wall. Routes live in the URL, so sharing a route = sending a link. Saved routes go to a shared list in Supabase.

Live: https://igricart.github.io/spraywall/

## Develop

    npm install
    npm run dev          # http://localhost:5173 (also on your LAN IP)

| Command            | What                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `npm run lint`     | ESLint                                                                                                        |
| `npm run format`   | Prettier (fix) — `format:check` only checks                                                                   |
| `npm test`         | Unit tests (Vitest) for `src/lib`                                                                             |
| `npm run build`    | Production build into `dist/`                                                                                 |
| `npm run test:e2e` | Phone-emulated touch test against the build (run `build` first; needs `npx playwright install chromium` once) |

CI (`.github/workflows/deploy.yml`) runs all of these on every PR and push; pushes to `master` deploy to GitHub Pages.

## Layout

    public/            wall.jpg, holds.json (wall version), privacy.html
    src/lib/           pure logic + unit tests (route link format, grades, hit-testing, API)
    src/components/    Wall (photo, zoom/pan, circles, gestures), RouteList, Ascent, Tape
    src/App.jsx        screens: route list, view a route, set a route; save form, sheets
    tests/e2e.mjs      phone-emulated browser test (mocked Supabase)
    docs/SPEC.md       agreed behaviour
    CLAUDE.md          context for AI-assisted development

## How it works

See [`docs/SPEC.md`](docs/SPEC.md). Every route carries its own circles (position, size, type); there is no shared hold map. Anyone creates routes; signed-in users update/delete routes (old versions go to `route_backups`), log sends, and change the wall photo.

## Make a route

**Set a new route** (bottom of the route list). Tap each hold on the photo: a circle appears and the bar at the bottom picks its type (Start, Hand+foot, Foot only, Top, Remove) and size. Drag the selected circle to move it. **Save** opens a form (name, grade, feet rule, your name). Nothing is stored before Save. A saved route has **Share** and **Edit**.

## Sends and grades

- Grades are stored as one number (index into the Font scale, see `src/lib/grades.js`); each phone shows Font or V (switch on the route list). Theme: Dark (default) / Light / Auto, button at the top of the route list.
- **Sent it ✓** on a saved route logs a send with an optional grade vote and 1–3 stars. Sends need **Sign in with Google**; browsing and creating routes don't. The database refuses sends from anonymous accounts (`0003_google_login.sql`).
- The list shows the **consensus grade** = median of the setter's grade and all votes (`routes_with_stats` view).

## Shared route list (Supabase)

- Tables + access rules: `supabase/migrations/*.sql`, run each once, in order, in Supabase → SQL Editor.
  Anyone can read and add routes; signed-in users can update or delete them, and every change is first copied to `route_backups` (restore from Supabase → Table Editor).
- Config: `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are public by design (the database rules decide what they allow). Never commit the `service_role` key.
- Without that config the app still works; the Routes tab says the list isn't connected.
