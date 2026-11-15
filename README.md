# Spray Wall

Wall photo + tappable hold overlay for a gym spray wall. Routes live in the URL, so sharing a route = sending a link. No backend yet.

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

## Map the holds (once per wall setup)

1. Put the straight-on wall photo in `public/wall.jpg`. If it's a **new setup**, bump `wall` in `public/holds.json` and empty its `holds` list — old route links then show a "holds may not match" warning instead of silently pointing at the wrong holds.
2. In the app choose **Map holds**. Tap empty wall to add a hold; tap a hold to select it (cyan). Drag the **selected** hold to move it; the **hold size** slider resizes it. Pinch, mouse wheel or +/− zoom the wall, and dragging anywhere else pans it. Progress autosaves in that browser.
3. **Export** (downloads `holds.json`), replace `public/holds.json`, commit.

## Make a route

**Route** mode: tap a hold to cycle start (green) → hand+foot (blue) → foot only (yellow) → top (pink) → off. Pick the feet rule (marked feet only / any feet / feet follow hands / footless), add name + grade, then **Share**.
