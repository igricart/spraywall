# Spray Wall – what the app does

Agreed 2026-11-16. Model B: every route carries its own hold circles; there is no shared hold map.

## Objects

- **Wall photo** – one current photo (versioned). Routes made on an older photo show "old wall".
- **Route** – name, grade, feet rule, setter (typed name), wall version, and its **circles**:
  `{x, y, r, t}` = position and size on the photo (0–1) + type `s` start, `h` hand+foot, `f` foot only, `t` top.
- **Send** – route, climber (Google account), optional grade vote, 1–3 stars.
- **Route backup** – every update or delete copies the previous version of the route here first.
  Restorable from the Supabase dashboard. Versions with the same name but different circles are expected.

## Who can do what

| Action                                           | No login | Signed in (Google) |
| ------------------------------------------------ | :------: | :----------------: |
| Browse, open and share routes                    |    ✅    |         ✅         |
| Create a route (place circles, pick types, Save) |    ✅    |         ✅         |
| Update or delete an existing route               |    ❌    |   ✅ (any route)   |
| Log a send, vote a grade, rate                   |    ❌    |         ✅         |
| Change the wall photo                            |    ❌    |         ✅         |

## Making a route (Route tab)

1. Tap a hold on the photo → a circle appears (last used size) and the type bar opens.
2. Type bar: Start / Hand+foot / Foot only / Top / Remove, plus a size slider for the selected circle.
3. Tap a circle to select it again; drag the selected circle to move it. Pinch / +− zooms the photo.
4. Name, grade, feet rule → **Save**. Nothing reaches the database before Save; until then the route
   lives on the phone and in the share link.

## Changing a saved route

- Any edit makes it "changed". Not signed in → **Save as new**. Signed in → **Update** (or **Save as new**).
- Signed in → **Delete** (with confirmation; its sends go too). The old version is kept in the backup.

## Not in scope (for now)

Shared hold map, admin list, comments, names next to sends, setter accounts.
