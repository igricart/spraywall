// Phone-emulated touch test against the production build. Run after `npm run build`:
//   npm run test:e2e
// Covers docs/SPEC.md (model B): routes carry their own circles; anyone creates, signed-in users
// update/delete, send, and change the photo.
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

  // ---- fake Supabase: routes, ascents, walls, storage, Google OAuth
  const UID = '00000000-0000-4000-8000-000000000001';
  const db = { routes: [], ascents: [], walls: [], photos: [], backups: [] };
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
    const eq = (k) => url.searchParams.get(k)?.replace('eq.', '');
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
    if (table === 'walls') {
      if (r.method() === 'POST') {
        const w = { id: db.walls.length + 1, ...r.postDataJSON() };
        db.walls.push(w);
        return reply([w], 201);
      }
      return reply(db.walls.slice(-1));
    }
    if (table === 'routes_with_stats') return reply(db.routes.map(withStats));
    if (table === 'routes') {
      if (r.method() === 'POST') {
        const row = {
          id: db.routes.length + 1,
          created_at: new Date().toISOString(),
          ...r.postDataJSON(),
        };
        db.routes.unshift(row);
        return reply([row], 201);
      }
      const row = db.routes.find((x) => x.id === +eq('id'));
      if (r.method() === 'PATCH') {
        db.backups.push({ action: 'update', old: structuredClone(row) }); // the db trigger
        Object.assign(row, r.postDataJSON());
        return reply([row]);
      }
      if (r.method() === 'DELETE') {
        db.backups.push({ action: 'delete', old: structuredClone(row) });
        db.routes = db.routes.filter((x) => x !== row);
        return req.fulfill({ status: 204, body: '' });
      }
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
        db.ascents = db.ascents.filter((x) => x.route_id !== +eq('route_id'));
        return req.fulfill({ status: 204, body: '' });
      }
      return reply(db.ascents.filter((a) => a.user_id === UID));
    }
    return req.fulfill({ status: 404, json: { message: `unmocked ${url.pathname}` } });
  });

  const hash = () => page.evaluate(() => location.hash);
  const circles = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('svg circle')].map((c) => c.getAttribute('class')),
    );
  async function answer(fn, ...answers) {
    const onDialog = (d) => (d.type() === 'prompt' ? d.accept(answers.shift()) : d.accept());
    page.on('dialog', onDialog);
    try {
      await fn();
    } finally {
      page.off('dialog', onDialog);
    }
  }
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
  const at = async (fx, fy) => {
    const b = await page.locator('svg').boundingBox();
    return [b.x + fx * b.width, b.y + fy * b.height];
  };
  const transform = () =>
    page.evaluate(() => document.querySelector('.view > div').style.transform);

  // ---- start without login: a plain visit lands on Routes; + New route opens an empty route
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#tab-route');
  const hasBackend = (await page.locator('#new-route').count()) > 0;
  await page.click(hasBackend ? '#new-route' : '#tab-route');
  await page.waitForSelector('svg image');
  assert.equal((await circles()).length, 0, 'new route has no circles');

  // ---- tap a hold: circle appears (hand+foot) and the picker opens; pick Start
  await page.touchscreen.tap(...(await at(0.5, 0.6)));
  await page.waitForSelector('.picker');
  assert.deepEqual(await circles(), ['h sel'], 'new circle selected');
  await page.click('#role-s');
  assert.deepEqual(await circles(), ['s sel'], 'type changed to start');
  assert.match(await hash(), /c=500\.600\.\d+s/, 'circle + type in the link');

  // ---- size slider resizes the selected circle; Done closes the picker
  await page.locator('#size').fill('40');
  assert.match(await hash(), /c=500\.600\.40s/, 'resized');
  await page.click('#done');
  assert.equal(await page.locator('.picker').count(), 0, 'picker closed');

  // ---- more holds: a top and a foot; then add one more and remove it
  await page.touchscreen.tap(...(await at(0.3, 0.2)));
  await page.click('#role-t');
  await page.click('#done');
  await page.touchscreen.tap(...(await at(0.7, 0.85)));
  await page.click('#role-f');
  await page.click('#done');
  await page.touchscreen.tap(...(await at(0.2, 0.85)));
  await page.click('#role-off');
  assert.deepEqual((await circles()).sort(), ['f', 's', 't'], 'three circles after remove');

  // ---- drag the selected circle; dragging elsewhere pans; pinch zooms
  await page.touchscreen.tap(...(await at(0.7, 0.85))); // select the foot
  const [fx, fy] = await at(0.7, 0.85);
  await drag(fx + 4, fy, fx - 40, fy - 20);
  const foot = (await hash())
    .match(/_(\d+)\.(\d+)\.\d+f/)
    .slice(1)
    .map(Number);
  assert.ok(foot[0] < 690 && foot[1] < 845, `foot moved up-left: ${foot}`);
  await page.click('#done');
  await page.click('#zin');
  await page.click('#zin');
  await page.waitForTimeout(300);
  const t0 = await transform();
  assert.match(t0, /scale\((?!1\))/, `zoomed in: ${t0}`);
  const view = await page.locator('.view').boundingBox();
  await drag(view.x + 140, view.y + 90, view.x + 40, view.y + 40);
  assert.notEqual(await transform(), t0, 'drag on the wall pans');
  assert.equal((await circles()).length, 3, 'panning adds nothing');
  const scale = async () => +(await transform()).match(/scale\(([\d.]+)/)[1];
  const s0 = await scale();
  const [cx, cy] = [view.x + view.width / 2, view.y + view.height / 2];
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
  assert.equal((await circles()).length, 3, 'pinch adds nothing');
  for (let i = 0; i < 4; i++) await page.click('#zout');
  await page.waitForTimeout(300);

  await page.selectOption('#feet', 'a');
  assert.match(await hash(), /ft=a/, 'feet rule in link');

  // ---- the link alone reproduces the route
  const link = await hash();
  await page.goto(`http://localhost:${PORT}/${link}`);
  await page.reload();
  await page.waitForSelector('svg circle');
  assert.deepEqual((await circles()).sort(), ['f', 's', 't'], 'route restored from link');

  if (hasBackend) {
    // ---- save without login; nothing reached the db before Save
    assert.equal(db.routes.length, 0, 'nothing saved before Save');
    await page.selectOption('#grade', '6B');
    await answer(() => page.click('#save'), 'Test route', 'Tester');
    await page.waitForSelector('#save:has-text("Saved")');
    const saved = db.routes[0];
    assert.deepEqual(
      [saved.name, saved.difficulty, saved.setter, saved.wall, saved.feet, saved.holds.length],
      ['Test route', 6, 'Tester', 2, 'a', 3],
      'route saved with its circles',
    );
    assert.deepEqual(saved.holds.map((c) => c.t).sort(), ['f', 's', 't']);
    assert.match(await hash(), /i=1&/, 'route id in link');

    // ---- not signed in: a changed saved route can only be saved as new
    assert.equal(await page.locator('#delete-route').count(), 0, 'no delete without login');
    await page.fill('#name', 'Test route v2');
    assert.equal(await page.locator('#save').textContent(), 'Save as new');
    assert.equal(await page.locator('#update').count(), 0, 'no update without login');

    // ---- sends need Google: open the saved route, sign in, come back to it
    await page.click('#tab-list');
    await page.waitForSelector('.list li');
    await page.click('.list li button');
    assert.match(await page.locator('#sent').textContent(), /Sign in with Google/);
    await page.click('#sent');
    await page.waitForSelector('#sent:has-text("Sent it")');
    assert.equal(await page.inputValue('#name'), 'Test route', 'route restored after sign-in');
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

    // ---- list: consensus grade = median(6B, 7A) = 6C; V scale; filters
    db.routes.push({
      id: 2,
      wall: 2,
      name: 'Other',
      difficulty: 10,
      setter: null,
      feet: 'm',
      holds: [{ x: 0.4, y: 0.4, r: 0.02, t: 's' }],
      created_at: new Date(Date.now() - 864e5).toISOString(),
    });
    await page.click('#tab-list');
    await page.waitForSelector('.list li');
    const items = page.locator('.list li');
    assert.equal(await items.count(), 2, 'list shows both routes');
    assert.match(await items.first().innerText(), /Test route 6C ✓/, 'consensus grade + tick');
    assert.match(await items.first().innerText(), /2 votes, set as 6B · 1 send · ★★★/);
    await page.click('#scale-v');
    assert.match(await items.first().innerText(), /Test route V5/, 'V scale display');
    await page.selectOption('#grade-filter', 'V6');
    assert.equal(await items.count(), 1, 'grade filter in V');
    await page.selectOption('#grade-filter', '');
    await page.selectOption('#sent-filter', 'todo');
    assert.match(await items.innerText(), /Other/, 'not sent yet');
    await page.selectOption('#sent-filter', 'all');

    // ---- signed in: update a route in place (old version backed up), delete another
    await page.locator('.list li button', { hasText: 'Test route' }).click();
    await page.waitForSelector('svg circle');
    await page.touchscreen.tap(...(await at(0.85, 0.3)));
    await page.click('#role-h');
    assert.equal(await page.locator('#save').textContent(), 'Save as new');
    await page.click('#update');
    await page.waitForSelector('#save:has-text("Saved")');
    assert.equal(db.routes.find((x) => x.id === 1).holds.length, 4, 'route updated in place');
    assert.equal(db.routes.length, 2, 'update made no new route');
    assert.deepEqual(
      [db.backups[0].action, db.backups[0].old.holds.length],
      ['update', 3],
      'old version backed up',
    );
    await page.click('#tab-list');
    await page.locator('.list li button', { hasText: 'Other' }).click();
    await answer(() => page.click('#delete-route'));
    await page.waitForSelector('.list li');
    assert.deepEqual(
      db.routes.map((x) => x.name),
      ['Test route'],
      'route deleted',
    );
    assert.equal(db.backups.at(-1).action, 'delete', 'deleted route backed up');

    // ---- signed in: new wall photo -> new wall version, existing routes flagged
    await answer(() =>
      page.setInputFiles('#photo', {
        name: 'wall.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from(wallJpg),
      }),
    );
    await page.waitForFunction(() =>
      document.querySelector('.list li')?.innerText.includes('old wall'),
    );
    assert.equal(db.photos.length, 1, 'photo uploaded');
    assert.equal(db.photos[0].jpeg, true, 'uploaded as a JPEG');
    assert.equal(db.walls.at(-1).version, 3, 'new photo = new wall version');

    await page.click('#signout');
    await page.waitForSelector('#signin');
  } else console.log('(no backend config in this build: skipped route list checks)');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('e2e ok');
} finally {
  await browser.close();
  server.kill();
}
