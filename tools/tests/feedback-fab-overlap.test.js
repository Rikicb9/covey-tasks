// The report button must not cover note text — BR-20261110-170022-be3d.
// Opens a long note in Notas on desktop and checks, at the top and after scrolling to the end, that no text line
// sits under the report icon, which lives in the note's right margin. Also checks Covey Tasks still shows it.
// Run: node tools/tests/feedback-fab-overlap.test.js   (needs Playwright + Chromium; serves the repo locally, Supabase mocked)
const { chromium } = require('playwright');
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
const UID = '00000000-0000-0000-0000-000000000001', NID = '00000000-0000-0000-0000-0000000000a1';
const para = i => `<p>Paragraph ${i}: a long line of placeholder words that runs across the whole width of the note canvas so it reaches the right edge of the editor on a wide screen, and wraps.</p>`;
const NOTE = { id: NID, folder_id: null, title: 'Test', body: Array.from({ length: 60 }, (_, i) => para(i + 1)).join(''), tags: [], version: 1, updated_at: '2026-11-10T09:00:00Z', title_sep: true, pinned: false };

// every text line rect inside the editor that is on screen and intersects the button
const overlap = () => {
  const fab = document.getElementById('fbFab'); if (!fab || getComputedStyle(fab).display === 'none') return { hidden: true, hits: 0 };
  const f = fab.getBoundingClientRect(), e = document.getElementById('ed'), clip = e.getBoundingClientRect();
  let hits = 0; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) { const top = Math.max(r.top, clip.top), bot = Math.min(r.bottom, clip.bottom, innerHeight);
      if (bot - top > 2 && r.right > f.left + 1 && r.left < f.right - 1 && bot > f.top + 1 && top < f.bottom - 1) hits++; } }
  return { hidden: false, hits, f: [Math.round(f.left), Math.round(f.top), Math.round(f.width), Math.round(f.height)] };
};

async function notas(b, base, vp) {
  const ctx = await b.newContext({ viewport: vp }), p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
  await p.route(/supabase\.co|script\.google\.com/, r => { const u = r.request().url();
    if (/\/rest\/v1\/notes\?/.test(u) && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([NOTE]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: /auth\/v1\/user/.test(u) ? JSON.stringify({ id: UID, email: 'test@example.com' }) : '[]' }); });
  await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
  await p.goto(`${base}/notebook.html`); await p.waitForSelector('#notes li.nc', { state: 'attached', timeout: 8000 });
  await p.evaluate(() => document.querySelector('#notes li.nc').click()); await p.waitForTimeout(500);
  const tag = `Notas ${vp.width}×${vp.height}`;
  const top = await p.evaluate(overlap);
  ok(!top.hidden, `${tag}: report button visible`);
  ok(top.hits === 0, `${tag}: no note text under the button at the top of the note (${top.hits} line(s) covered, button ${top.f})`);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `notas-${vp.width}-top.png`) });
  // scroll every scrollable ancestor of the editor to the end
  await p.evaluate(() => { for (let el = document.getElementById('ed'); el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 2) el.scrollTop = el.scrollHeight; scrollTo(0, document.body.scrollHeight); });
  await p.waitForTimeout(200);
  const end = await p.evaluate(overlap);
  ok(end.hits === 0, `${tag}: no note text under the button after scrolling to the end (${end.hits} line(s) covered)`);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `notas-${vp.width}-end.png`) });
  const g = await p.evaluate(() => { const f = document.getElementById('fbFab').getBoundingClientRect(), e = document.getElementById('ed').getBoundingClientRect(); return { gap: Math.round(f.left - e.right), w: f.width }; });
  ok(g.w <= 48 && g.gap >= 4, `${tag}: icon (${g.w}px) sits in the right margin, ${g.gap}px clear of the note text column`);
  await ctx.close();
}

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  for (const vp of [{ width: 1872, height: 914 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }]) await notas(b, base, vp);
  { // Covey Tasks has no slot: the button keeps floating bottom-right as before
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
    await p.route(/supabase\.co|script\.google\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: /auth\/v1\/user/.test(r.request().url()) ? JSON.stringify({ id: UID, email: 'test@example.com' }) : '[]' }));
    await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
    await p.goto(`${base}/index.html`); await p.waitForSelector('#fbFab', { state: 'attached', timeout: 8000 });
    ok(await p.evaluate(() => { const f = document.getElementById('fbFab'); return f.parentNode === document.body && getComputedStyle(f).position === 'fixed'; }), 'Covey Tasks 1440px: report icon floats bottom-right');
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
