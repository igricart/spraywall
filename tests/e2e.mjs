// Phone-emulated touch test against the production build. Run after `npm run build`:
//   npm run test:e2e
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 4173;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  stdio: 'ignore',
});
const browser = await chromium.launch();
try {
  for (let i = 0; ; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      break;
    } catch (e) {
      if (i > 50) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  // ---- fake Supabase: routes, ascents, walls, admins, storage, Google OAuth
  const UID = '00000000-0000-4000-8000-000000000001';
  const db = { routes: [], ascents: [], walls: [], admins: [UID], photos: [] };
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const withStats = (r) => {
    const as = db.ascents.filter((a) => a.route_id === r.id);
    const votes = [r.difficulty, ...as.map((a) => a.difficulty)].filter((d) => d != null);
    const stars = as.map((a) => a.rating).filter(Boolean);
    return {
      ...r,
      sends: as.length,
      rating: stars.length ? stars.reduce((a, b) => a + b) / stars.length : null,
      votes: votes.length,
      consensus: votes.length ? median(votes) : null,
    };
  };
  const wallJpg = await (await fetch(`http://localhost:${PORT}/wall.jpg`)).arrayBuffer();
  await page.route(/\/(rest|auth|storage)\/v1\//, async (req) => {
    const r = req.request();
    const url = new URL(r.url());
    const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => req.fulfill({ status, json: single ? rows[0] : rows });
    if (url.pathname.endsWith('/auth/v1/authorize')) {
      assert.equal(url.searchParams.get('provider'), 'google');
      const back = new URL(url.searchParams.get('redirect_to'));
      back.searchParams.set('code', 'fake-code');
      return req.fulfill({ status: 302, headers: { location: back.href } });
    }
    if (url.pathname.endsWith('/auth/v1/token')) {
      const now = Math.floor(Date.now() / 1000);
      return req.fulfill({
        json: {
          access_token: 'fake',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: 'fake-refresh',
          user: {
            id: UID,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'climber@example.com',
            user_metadata: { full_name: 'Test Climber' },
            app_metadata: { provider: 'google' },
            created_at: new Date().toISOString(),
          },
        },
      });
    }
    if (url.pathname.endsWith('/auth/v1/logout')) return req.fulfill({ status: 204, body: '' });
    if (url.pathname.includes('/storage/v1/object/public/walls/'))
      return req.fulfill({ contentType: 'image/jpeg', body: Buffer.from(wallJpg) });
    if (url.pathname.includes('/storage/v1/object/walls/')) {
      const body = r.postDataBuffer() ?? Buffer.alloc(0);
      const jpg = body.indexOf(Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic bytes
      db.photos.push({
        path: url.pathname.split('/').pop(),
        jpeg: jpg >= 0 && /image\/jpeg/i.test(body.subarray(0, jpg).toString('latin1')),
      });
      return req.fulfill({ json: { Key: `walls/${db.photos.at(-1).path}` } });
    }
    const table = url.pathname.split('/').pop();
    if (table === 'admins')
      return reply(
        db.admins
          .filter((u) => url.searchParams.get('user_id') === `eq.${u}`)
          .map((u) => ({ user_id: u })),
      );
    if (table === 'walls') {
      if (r.method() === 'POST') {
        const w = { id: db.walls.length + 1, ...r.postDataJSON() };
        db.walls.push(w);
        return reply([w], 201);
      }
      return reply(db.walls.slice(-1));
    }
    if (table === 'routes_with_stats') return reply(db.routes.map(withStats));
    if (table === 'routes' && r.method() === 'POST') {
      const row = {
        id: db.routes.length + 1,
        created_at: new Date().toISOString(),
        ...r.postDataJSON(),
      };
      db.routes.unshift(row);
      return reply([row], 201);
    }
    if (table === 'ascents') {
      if (r.method() === 'POST') {
        const a = r.postDataJSON();
        db.ascents = db.ascents.filter(
          (x) => !(x.route_id === a.route_id && x.user_id === a.user_id),
        );
        db.ascents.push(a);
        return reply([a], 201);
      }
      if (r.method() === 'DELETE') {
        const rid = +url.searchParams.get('route_id').replace('eq.', '');
        db.ascents = db.ascents.filter((x) => x.route_id !== rid);
        return req.fulfill({ status: 204, body: '' });
      }
      return reply(db.ascents.filter((a) => a.user_id === UID));
    }
    return req.fulfill({ status: 404, json: { message: `unmocked ${url.pathname}` } });
  });

  const hash = () => page.evaluate(() => location.hash);
  async function answer(fn, ...answers) {
    const onDialog = (d) => (d.type() === 'prompt' ? d.accept(answers.shift()) : d.accept());
    page.on('dialog', onDialog);
    try {
      await fn();
    } finally {
      page.off('dialog', onDialog);
    }
  }

  // ---- not signed in: no Wall setup; sign in as admin -> Wall setup appears
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#signin');
  assert.equal(await page.locator('#tab-map').count(), 0, 'no wall setup for visitors');
  await page.click('#signin');
  await page.waitForSelector('#tab-map');
  await page.click('#tab-map');
  await page.waitForSelector('svg image');
  assert.equal(await page.locator('#publish').isDisabled(), true, 'nothing to publish yet');

  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  async function drag(x0, y0, x1, y1) {
    await touch('touchStart', x0, y0);
    for (let i = 1; i <= 10; i++)
      await touch('touchMove', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
    await touch('touchEnd');
  }
  const holds = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('wall-draft') || '{"holds":[]}').holds);
  const svgBox = () => page.locator('svg').boundingBox();
  const onScreen = async (h) => {
    const b = await svgBox();
    return [b.x + h.x * b.width, b.y + h.y * b.height];
  };
  const transform = () =>
    page.evaluate(() => document.querySelector('.view > div').style.transform);

  // ---- wall setup gestures (edits a local draft)
  let b = await svgBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  let h = await holds();
  assert.equal(h.length, 1, 'tap adds a hold');

  let [x, y] = await onScreen(h[0]);
  await drag(x + 5, y, x + 60, y + 30); // start a bit off-centre: finger halo
  const moved = (await holds())[0];
  assert.equal((await holds()).length, 1, 'dragging a hold adds nothing');
  assert.ok(moved.x > h[0].x + 0.05 && moved.y > h[0].y, 'hold follows the finger');

  await page.click('#zin');
  await page.click('#zin');
  await page.waitForTimeout(300);
  const t0 = await transform();
  assert.match(t0, /scale\((?!1\))/, `zoomed in: ${t0}`);
  const view = await page.locator('.view').boundingBox();
  await drag(view.x + 140, view.y + 90, view.x + 40, view.y + 40); // empty area -> pan (keeps the hold in view)
  assert.notEqual(await transform(), t0, 'drag on empty wall pans');
  assert.equal((await holds()).length, 1, 'panning adds nothing');

  [x, y] = await onScreen(moved);
  await drag(x, y, x - 50, y);
  const zmoved = (await holds())[0];
  assert.ok(zmoved.x < moved.x && Math.abs(zmoved.y - moved.y) < 0.01, 'drag works while zoomed');

  const view2 = await page.locator('.view').boundingBox();
  await page.touchscreen.tap(view2.x + 30, view2.y + 30);
  assert.equal((await holds()).length, 2, 'second hold added');
  [x, y] = await onScreen(zmoved);
  const tp = await transform();
  await drag(x, y, x + 40, y + 40);
  assert.deepEqual((await holds())[0], zmoved, 'unselected hold does not move');
  assert.notEqual(await transform(), tp, 'drag on unselected hold pans the wall');

  const scale = async () => +(await transform()).match(/scale\(([\d.]+)/)[1];
  const s0 = await scale();
  const c = await page.locator('.view').boundingBox();
  const [cx, cy] = [c.x + c.width / 2, c.y + c.height / 2];
  const pinch = (type, d) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: cx - d, y: cy, id: 0 },
              { x: cx + d, y: cy, id: 1 },
            ],
    });
  await pinch('touchStart', 20);
  for (let d = 30; d <= 120; d += 10) await pinch('touchMove', d);
  await pinch('touchEnd');
  assert.ok((await scale()) > s0 * 1.3, `pinch zooms ${s0} -> ${await scale()}`);
  assert.equal((await holds()).length, 2, 'pinch adds nothing');

  await answer(() => page.click('#reset'));
  assert.equal((await holds()).length, 0, 'reset all clears holds');

  await page.click('#zout');
  await page.click('#zout');
  await page.waitForTimeout(300);
  b = await svgBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);

  // ---- route mode still shows the PUBLISHED wall (empty) until Publish
  await page.click('#tab-route');
  assert.equal(await page.locator('circle').count(), 0, 'draft not visible to climbers');
  assert.match(
    await page.locator('#draft-note').innerText(),
    /1 unpublished holds/,
    'admin told to publish',
  );
  await page.click('#tab-map');
  await answer(() => page.click('#publish'));
  await page.waitForSelector('#publish:disabled');
  assert.equal(db.walls.length, 1, 'wall published');
  assert.deepEqual(
    [db.walls[0].version, db.walls[0].photo_url, db.walls[0].holds.length],
    [2, 'wall.jpg', 1], // bundled holds.json is wall 2 (gym photo)
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('wall-draft')),
    null,
    'draft cleared',
  );

  // ---- type picker on the published hold
  await page.click('#tab-route');
  b = await svgBox();
  await page.touchscreen.tap(b.x + b.width / 2 + 8, b.y + b.height / 2 + 4);
  await page.waitForSelector('.picker');
  await page.click('#role-s');
  assert.match(await hash(), /w=2&h=\d+s/, 'picker sets start');
  assert.equal(await page.locator('.picker').count(), 0, 'picker closes after choosing');
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('#role-t');
  assert.match(await hash(), /h=\d+t/, 'picker changes type');
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('#role-off');
  assert.match(await hash(), /h=$/, 'picker Off removes hold');
  await page.selectOption('#feet', 'a');
  assert.match(await hash(), /ft=a/, 'feet rule in link');

  // ---- save a 6B route (no login needed: sign out first)
  await page.click('#tab-list');
  await page.click('#signout');
  await page.waitForSelector('#signin');
  assert.equal(await page.locator('#tab-map').count(), 0, 'wall setup gone after sign out');
  await page.click('#tab-route');
  b = await svgBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('#role-s');
  await page.selectOption('#grade', '6B');
  await answer(() => page.click('#save'), 'Test route', 'Tester');
  await page.waitForSelector('#save:has-text("Saved")');
  const saved = db.routes[0];
  assert.deepEqual(
    [saved.name, saved.difficulty, saved.setter, saved.wall, saved.feet],
    ['Test route', 6, 'Tester', 2, 'a'],
    'route saved with numeric grade',
  );
  assert.equal(Object.values(saved.holds)[0], 's');

  // ---- sends need Google: sign in, come back to the same route
  assert.match(await page.locator('#sent').textContent(), /Sign in with Google/);
  await page.click('#sent');
  await page.waitForSelector('#sent:has-text("Sent it")');
  assert.equal(await page.inputValue('#name'), 'Test route', 'route restored after sign-in');
  assert.match(await hash(), /i=1&/, 'route id kept in link');

  await page.click('#sent');
  await page.selectOption('#vote', '7A');
  await page.click('#star-3');
  await page.click('#log');
  await page.waitForSelector('#sent.done');
  assert.deepEqual(
    db.ascents,
    [{ route_id: 1, user_id: UID, difficulty: 10, rating: 3 }],
    'ascent logged',
  );
  assert.match(await page.locator('#sent').textContent(), /voted 7A/);

  db.routes.push({
    id: 2,
    wall: 2,
    name: 'Other',
    difficulty: 10,
    setter: null,
    feet: 'm',
    holds: { 1: 't' },
    created_at: new Date(Date.now() - 864e5).toISOString(),
  });

  // ---- list: consensus = median(6B, 7A) = 6C; my send ticked
  await page.click('#tab-list');
  await page.waitForSelector('.list li');
  const items = page.locator('.list li');
  assert.equal(await items.count(), 2, 'list shows both routes');
  const first = await items.first().innerText();
  assert.match(first, /Test route 6C ✓/, `consensus grade + tick: ${first}`);
  assert.match(first, /2 votes, set as 6B · 1 send · ★★★/);
  assert.doesNotMatch(first, /old wall/);

  await page.click('#scale-v');
  assert.match(await items.first().innerText(), /Test route V5/, 'V scale display');
  await page.selectOption('#grade-filter', 'V6');
  assert.equal(await items.count(), 1, 'grade filter in V');
  await page.selectOption('#grade-filter', '');
  await page.selectOption('#sent-filter', 'mine');
  assert.match(await items.innerText(), /Test route/, 'my sends');
  await page.selectOption('#sent-filter', 'todo');
  assert.match(await items.innerText(), /Other/, 'not sent yet');

  await page.click('.list li button');
  assert.equal(await page.inputValue('#name'), 'Other', 'opening a route loads it');
  assert.equal(await page.inputValue('#grade'), 'V6', 'grade shown in chosen scale');
  assert.match(await hash(), /h=1t/);
  assert.equal(
    await page.locator('#save').textContent(),
    'Saved ✓',
    'opened route counts as saved',
  );
  assert.equal(await page.locator('#sent').textContent(), 'Sent it ✓', 'not sent yet');

  await page.click('#tab-list');
  await page.selectOption('#sent-filter', 'mine');
  await page.click('.list li button');
  await page.click('#sent');
  await page.click('#unsend');
  await page.waitForSelector('#sent:not(.done)');
  assert.deepEqual(db.ascents, [], 'ascent removed');

  await page.fill('#name', 'Test route v2');
  assert.equal(await page.locator('#save').textContent(), 'Save', 'edited route is unsaved');
  assert.equal(await page.locator('#sent').count(), 0, 'no send on unsaved route');
  assert.doesNotMatch(await hash(), /i=/);

  // ---- new photo -> upload (shrunk to jpeg) -> publish as version 3 -> old routes flagged
  await page.click('#tab-map');
  await page.setInputFiles('#photo', {
    name: 'wall.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(wallJpg),
  });
  await page.waitForFunction(() =>
    document.querySelector('svg image')?.getAttribute('href')?.includes('/storage/'),
  );
  assert.equal(db.photos.length, 1, 'photo uploaded');
  assert.equal(db.photos[0].jpeg, true, 'uploaded as a JPEG');
  await answer(() => page.click('#publish'));
  await page.waitForSelector('#publish:disabled');
  assert.equal(db.walls.at(-1).version, 3, 'new photo = new wall version');
  assert.match(db.walls.at(-1).photo_url, /\/storage\/v1\/object\/public\/walls\/wall-\d+\.jpg$/);
  assert.equal(db.walls.at(-1).holds.length, 1, 'holds carried over to the new photo');
  await page.click('#tab-list');
  await page.selectOption('#sent-filter', 'all');
  assert.match(await items.first().innerText(), /old wall/, 'routes on version 2 flagged');

  // ---- account + sign out
  assert.match(await page.locator('.account').innerText(), /Test Climber/);
  await page.click('#signout');
  await page.waitForSelector('#signin');

  await page.goto(`http://localhost:${PORT}/#w=9&h=1s`);
  await page.reload();
  await page.waitForSelector('.warn');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('e2e ok');
} finally {
  await browser.close();
  server.kill();
}
