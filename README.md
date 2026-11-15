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

    public/            wall.jpg, holds.json (served as-is)
    src/lib/           pure logic + unit tests (route link format, hold hit-testing)
    src/components/    Wall.jsx: photo, zoom/pan, hold circles, touch gestures
    src/App.jsx        state + header controls
    tests/e2e.mjs      browser test

## Wall photo + hold map (admins only)

Three layers: the **wall photo** and its **hold circles** (one per physical hold) belong to the admin; **routes** pick circles and colour them (anyone); **sends** are logged by signed-in climbers.

1. Sign in with Google with an account listed in the `admins` table (see `0004_walls.sql`). A **Wall setup** tab appears.
2. **Photo** uploads a new straight-on wall photo (shrunk to 2400 px). Tap empty wall to add a hold, tap to select (cyan), drag the selected one, **hold size** slider resizes it. Pinch / +− zoom.
3. Edits are a **draft** on that phone; climbers keep seeing the published wall. **Publish** makes it live; **Discard** throws the draft away.
4. Publishing with a new photo creates a new wall version, so older routes get an "old wall" tag. Publishing hold fixes on the same photo keeps the version. Hold ids are never reused.

## Make a route

**Route** tab: tap a hold, then pick its type in the bar at the bottom: Start (green), Hand+foot (blue), Foot only (yellow), Top (pink) or Off. Pick the feet rule (marked feet only / any feet / feet follow hands / footless), add name + grade, then **Save** (shared list) or **Share** (link).

## Sends and grades

- Grades are stored as one number (index into the Font scale, see `src/lib/grades.js`); each phone shows Font or V (switch in the Routes tab).
- **Sent it ✓** on a saved route logs a send with an optional grade vote and 1–3 stars. Sends need **Sign in with Google**; browsing and creating routes don't. The database refuses sends from anonymous accounts (`0003_google_login.sql`).
- The list shows the **consensus grade** = median of the setter's grade and all votes (`routes_with_stats` view).

## Shared route list (Supabase)

- Tables + access rules: `supabase/migrations/*.sql`, run each once, in order, in Supabase → SQL Editor.
  Anyone can read and add routes; nobody can edit or delete from the app. Delete spam in Supabase → Table Editor → `routes`.
- Config: `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are public by design (the database rules decide what they allow). Never commit the `service_role` key.
- Without that config the app still works; the Routes tab says the list isn't connected.
