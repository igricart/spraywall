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
  await page.goto(`http://localhost:${PORT}/`);
  await page.click('#tab-map'); // plain visit may land on the route list
  await page.waitForSelector('svg image');

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
  const holds = () => page.evaluate(() => JSON.parse(localStorage.getItem('holds-w1') || '[]'));
  const svgBox = () => page.locator('svg').boundingBox();
  const onScreen = async (h) => {
    const b = await svgBox();
    return [b.x + h.x * b.width, b.y + h.y * b.height];
  };
  const transform = () =>
    page.evaluate(() => document.querySelector('.view > div').style.transform);

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
  b = await svgBox();
  const view = await page.locator('.view').boundingBox();
  await drag(view.x + 40, view.y + 40, view.x + 140, view.y + 90); // empty corner -> pan
  assert.notEqual(await transform(), t0, 'drag on empty wall pans');
  assert.equal((await holds()).length, 1, 'panning adds nothing');

  [x, y] = await onScreen(moved);
  await drag(x, y, x - 50, y);
  const zmoved = (await holds())[0];

  // only the selected hold drags: add a 2nd hold (now selected), then drag on hold 1 -> pans
  const view2 = await page.locator('.view').boundingBox();
  await page.touchscreen.tap(view2.x + 30, view2.y + 30);
  assert.equal((await holds()).length, 2, 'second hold added');
  [x, y] = await onScreen(zmoved);
  const tp = await transform();
  await drag(x, y, x + 40, y + 40);
  assert.deepEqual((await holds())[0], zmoved, 'unselected hold does not move');
  assert.notEqual(await transform(), tp, 'drag on unselected hold pans the wall');
  assert.ok(zmoved.x < moved.x && Math.abs(zmoved.y - moved.y) < 0.01, 'drag works while zoomed');

  // two-finger pinch out -> zooms in, adds no hold
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

  page.once('dialog', (d) => d.accept());
  await page.click('#reset');
  assert.equal((await holds()).length, 0, 'reset all clears holds');

  await page.click('#zout');
  await page.click('#zout');
  await page.waitForTimeout(300);
  b = await svgBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('#tab-route');
  b = await svgBox();
  await page.touchscreen.tap(b.x + b.width / 2 + 8, b.y + b.height / 2 + 4);
  await page.waitForSelector('.picker');
  await page.click('#role-s');
  assert.match(await page.evaluate(() => location.hash), /w=1&h=\d+s/, 'picker sets start');
  assert.equal(await page.locator('.picker').count(), 0, 'picker closes after choosing');
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('#role-t');
  assert.match(await page.evaluate(() => location.hash), /h=\d+t/, 'picker changes type');
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('#role-off');
  assert.match(await page.evaluate(() => location.hash), /h=$/, 'picker Off removes hold');

  // feet rule goes into the link
  await page.selectOption('#feet', 'a');
  assert.match(await page.evaluate(() => location.hash), /ft=a/, 'feet rule in link');

  // Shared route list against a fake Supabase (only when the build has backend config)
  if (await page.locator('#save').count()) {
    const db = [];
    await page.route('**/rest/v1/routes**', async (req) => {
      if (req.request().method() === 'POST') {
        const row = {
          id: db.length + 1,
          created_at: new Date().toISOString(),
          ...req.request().postDataJSON(),
        };
        db.unshift(row);
        return req.fulfill({ status: 201, json: [row] });
      }
      return req.fulfill({ json: db });
    });
    b = await svgBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.click('#role-s');
    await page.fill('#grade', '6B');
    const answers = ['Test route', 'Tester'];
    const onDialog = (d) => d.accept(answers.shift());
    page.on('dialog', onDialog);
    await page.click('#save');
    await page.waitForSelector('#save:has-text("Saved")');
    page.off('dialog', onDialog);
    assert.equal(db.length, 1, 'route saved');
    assert.deepEqual(
      {
        name: db[0].name,
        grade: db[0].grade,
        setter: db[0].setter,
        wall: db[0].wall,
        feet: db[0].feet,
      },
      { name: 'Test route', grade: '6B', setter: 'Tester', wall: 1, feet: 'a' },
    );
    assert.equal(Object.values(db[0].holds)[0], 's');
    db.push({ ...db[0], id: 2, name: 'Other', grade: '7A', holds: { 1: 't' } });

    await page.click('#tab-list');
    await page.waitForSelector('.list li');
    assert.equal(await page.locator('.list li').count(), 2, 'list shows both routes');
    await page.selectOption('#grade-filter', '7A');
    assert.equal(await page.locator('.list li').count(), 1, 'grade filter');
    await page.click('.list li button');
    assert.equal(await page.inputValue('#name'), 'Other', 'opening a route loads it');
    assert.match(await page.evaluate(() => location.hash), /h=1t/);
    assert.equal(
      await page.locator('#save').textContent(),
      'Saved ✓',
      'opened route counts as saved',
    );
  } else console.log('(no backend config in this build: skipped route list checks)');

  await page.goto(`http://localhost:${PORT}/#w=9&h=1s`);
  await page.reload();
  await page.waitForSelector('.warn');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('e2e ok');
} finally {
  await browser.close();
  server.kill();
}
