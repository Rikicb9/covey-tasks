// Covey Tasks on phones — BR-20261115-114949-9509.
// 1) The report icon must not cover the "Sin clasificar" tasks or their ✕, and the last task of every list can be scrolled clear of it.
// 2) After adding a task from "Nueva tarea sin clasificar..." with the keyboard open, the new task is shown and the list still scrolls by touch.
// Run: node tools/tests/covey-phone-fab-unclassified.test.js   (needs Playwright + Chromium; serves the repo locally, Supabase mocked)
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const SHOTS = process.env.SHOT_DIR || '';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const UID = '00000000-0000-0000-0000-000000000001';

function state(unclassified) {
  let id = 1; const T = (text, q) => ({ id: id++, text, done: false, star: false, q, subs: [], notes: '' });
  const tasks = [...Array.from({ length: 16 }, (_, i) => T('Quad ' + i, 'q' + (1 + i % 4))), ...Array.from({ length: unclassified }, (_, i) => T('Unclassified ' + i, null))];
  return { al: 0, filter: 'all', showDone: false, view: 'matrix', lists: [{ id: 1, name: 'Mis Tareas', icon: '✦', tasks }], nid: id };
}

// elements of `sel` that are visible on screen and intersect the report button
const under = sel => {
  const fab = document.getElementById('fbFab'); if (!fab || getComputedStyle(fab).display === 'none') return null;
  const f = fab.getBoundingClientRect();
  return [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(), c = e.closest('#mx-unclassified-list,#tasks-container'), k = c ? c.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const top = Math.max(r.top, k.top), bot = Math.min(r.bottom, k.bottom);
    return r.width && bot - top > 1 && r.right > f.left + 1 && r.left < f.right - 1 && bot > f.top + 1 && top < f.bottom - 1; }).length;
};

async function open(b, base, n, vp) {
  const ctx = await b.newContext({ ...devices['Pixel 5'], viewport: vp }), p = await ctx.newPage();
  const S = state(n);
  await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
  await p.route(/supabase\.co|script\.google\.com/, r => { const u = r.request().url();
    if (/covey_state/.test(u) && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: S, updated_at: '2026-11-15T10:00:00Z' }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: /auth\/v1\/user/.test(u) ? JSON.stringify({ id: UID, email: 'test@example.com' }) : '[]' }); });
  await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
  await p.goto(`${base}/index.html`); await p.waitForSelector('#fbFab', { state: 'attached', timeout: 8000 }); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('tab-matrix').click()); await p.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x, y0, dy) => { x = Math.round(x); y0 = Math.round(y0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let d = 8; d <= dy; d += 8) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - d }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300); };
  return { ctx, p, swipe };
}
const toEnd = sel => { const l = document.querySelector(sel); l.scrollTop = l.scrollHeight; };

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  const vp = { width: 360, height: 730 };

  ok(/interactive-widget=resizes-content/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/<meta name="viewport"[^>]*>/)[0]),
    'viewport meta asks Android to resize the page above the keyboard (interactive-widget=resizes-content)');

  { // as in the report: 3 unclassified tasks
    const { ctx, p } = await open(b, base, 3, vp);
    ok(await p.evaluate(under, '.mx-unclass-del') === 0, '360×730, 3 tasks: no ✕ of "Sin clasificar" under the report icon');
    ok(await p.evaluate(under, '.mx-unclass-chip') === 0, '360×730, 3 tasks: no "Sin clasificar" task under the report icon');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'covey-360-3.png') });
    await ctx.close();
  }
  { // long list: last task scrolls clear, touch swipe scrolls
    const { ctx, p, swipe } = await open(b, base, 10, vp);
    const box = await p.locator('#mx-unclassified-list').boundingBox();
    await swipe(box.x + box.width / 2, box.y + box.height - 15, 120);
    ok(await p.evaluate(() => document.getElementById('mx-unclassified-list').scrollTop) > 60, '360×730, 10 tasks: a touch swipe on a task scrolls "Sin clasificar"');
    await p.evaluate(toEnd, '#mx-unclassified-list'); await p.waitForTimeout(150);
    ok(await p.evaluate(under, '.mx-unclass-chip') === 0, '360×730, 10 tasks: scrolled to the end, no task under the report icon');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'covey-360-10-end.png') });
    // list view: last row can scroll clear too
    await p.evaluate(() => document.getElementById('tab-list').click()); await p.waitForTimeout(300);
    await p.evaluate(toEnd, '#tasks-container'); await p.waitForTimeout(150);
    ok(await p.evaluate(under, '.task-row') === 0, '360×730 list view: scrolled to the end, no task row under the report icon');
    await ctx.close();
  }
  { // quick-add with the keyboard open (page resized to the space above the keyboard)
    const { ctx, p, swipe } = await open(b, base, 6, vp);
    await p.tap('#mx-quick-add-input');
    await p.setViewportSize({ width: 360, height: 430 }); await p.waitForTimeout(200);
    for (const t of ['Added one', 'Added two']) { await p.keyboard.type(t); await p.keyboard.press('Enter'); await p.waitForTimeout(200); }
    const k = await p.evaluate(() => { const l = document.getElementById('mx-unclassified-list'), lr = l.getBoundingClientRect(), last = l.querySelector('.mx-unclass-chip:last-of-type'), r = last.getBoundingClientRect();
      return { text: last.textContent, visible: r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1 && r.bottom <= innerHeight, listBottom: Math.round(lr.bottom), ih: innerHeight, focused: document.activeElement.id }; });
    ok(/Added two/.test(k.text) && k.visible, `keyboard open: the task just added is shown in "Sin clasificar" (list ends at ${k.listBottom} of ${k.ih})`);
    ok(k.focused === 'mx-quick-add-input', 'keyboard open: focus stays in the quick-add field to add more');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'covey-360-keyboard.png') });
    await p.setViewportSize(vp); await p.waitForTimeout(200);
    await p.evaluate(() => document.getElementById('mx-unclassified-list').scrollTop = 0);
    const box = await p.locator('#mx-unclassified-list').boundingBox();
    await swipe(box.x + box.width / 2, box.y + box.height - 15, 100);
    ok(await p.evaluate(() => document.getElementById('mx-unclassified-list').scrollTop) > 40, 'after adding: a touch swipe still scrolls "Sin clasificar"');
    await ctx.close();
  }
  { // desktop unchanged
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
    await p.route(/supabase\.co|script\.google\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: /auth\/v1\/user/.test(r.request().url()) ? JSON.stringify({ id: UID, email: 'test@example.com' }) : '[]' }));
    await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
    await p.goto(`${base}/index.html`); await p.waitForSelector('#fbFab', { state: 'attached', timeout: 8000 });
    const d = await p.evaluate(() => { const r = document.getElementById('fbFab').getBoundingClientRect(); return [Math.round(innerWidth - r.right), Math.round(innerHeight - r.bottom)]; });
    ok(d[0] === 20 && d[1] === 16, `desktop 1440: report icon still 20 px from the right, 16 px from the bottom (${d})`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
