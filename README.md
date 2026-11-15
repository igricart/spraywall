# Spray Wall

Static page: wall photo + tappable hold overlay. Routes live in the URL, so sharing = sending a link. No backend yet.

## Run locally
    python3 -m http.server 8000      # then open http://localhost:8000
(Needs a server, not file://, because it loads holds.json.)
Phone on same wifi: http://<pc-ip>:8000

## Map the holds (once per wall setup)
1. Put the straight-on wall photo in `wall.jpg`.
2. Switch to **Map holds**. Tap a hold to add a circle (pick size with the slider first); tap a circle to remove it.
   Progress autosaves in this browser.
3. **Export holds.json** and commit it, replacing the existing file.

## Make a route
**Route** mode: tap a hold to cycle start → hand → foot → top → off. Add name + grade, then **Share**.

## Test
    node route.test.mjs

## Next
Week 2: Supabase (route list, login, ascents) + hosting on Cloudflare Pages.
