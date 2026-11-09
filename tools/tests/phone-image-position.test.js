// Image blocks keep their place on phones — BR-20261109-105746-79ff.
// A note laid out on desktop has an image block placed beside its 3rd paragraph. Opened on a phone,
// the image must show right after that paragraph (in the text flow), not at the end of the note.
// Run: node tools/tests/phone-image-position.test.js   (needs Playwright + Chromium; serves the repo locally, Supabase mocked)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const UID = '00000000-0000-0000-0000-000000000001', NID = '00000000-0000-0000-0000-0000000000a1';
const PNG = fs.readFileSync(path.join(ROOT, 'icon-notas-192.png'));
// as saved from desktop: the image block sits after paragraph 3 and is pinned beside it (data-x/y/w)
const para = i => `<p>Paragraph ${i} with enough words to wrap over a couple of lines on a phone screen.</p>`;
const BODY = [1, 2, 3].map(para).join('') +
  '<div class="float pic" data-x="420" data-y="60" data-w="300"><img data-img="' + UID + '/' + NID + '/00000000-0000-0000-0000-0000000000b1.png" alt=""></div>' +
  [4, 5, 6, 7, 8].map(para).join('');
const NOTE = { id: NID, folder_id: null, title: 'Test', body: BODY, tags: [], version: 1, updated_at: '2026-11-09T09:00:00Z', title_sep: true, pinned: false };

async function run(b, base, vp, label, how) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 820, isMobile: vp.width < 820 });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
  await p.route(/supabase\.co|script\.google\.com/, r => {
    const u = r.request().url();
    if (/\/storage\/v1\//.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (/\/auth\/v1\/user/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, email: 'test@example.com' }) });
    if (/\/rest\/v1\/notes\?/.test(u) && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([NOTE]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
  await p.goto(`${base}/notebook.html`);
  await p.waitForSelector('#notes li.nc', { state: 'attached', timeout: 8000 });
  await p.waitForTimeout(300);
  for (let i = 0; i < how; i++) { // open the note from the list, as a person does (twice = reopen after going back)
    await p.evaluate(() => document.querySelector('#notes li.nc').click());
    await p.waitForTimeout(400);
    if (i < how - 1) { await p.evaluate(() => history.back()); await p.waitForTimeout(400); }
  }
  const r = await p.evaluate(() => {
    const e = document.getElementById('ed'), kids = [...e.children].filter(c => !c.hasAttribute('data-ui'));
    const pic = e.querySelector('div.float.pic'), idx = kids.indexOf(pic);
    const prev = pic && pic.previousElementSibling, next = pic && pic.nextElementSibling;
    const pr = pic.getBoundingClientRect(), p3 = kids[2].getBoundingClientRect(), p4 = kids[idx + 1] ? kids[idx + 1].getBoundingClientRect() : null;
    return { idx, flow: e.classList.contains('flow'), prev: prev && prev.textContent.slice(0, 11), next: next && next.textContent.slice(0, 11),
      below3: pr.top >= p3.bottom - 1, above4: p4 ? pr.bottom <= p4.top + 1 : false, w: pr.width, edW: e.clientWidth };
  });
  ok(r.flow, `${label}: editor in phone flow layout`);
  ok(r.idx === 3, `${label}: image block is 4th in the text (index ${r.idx}; after "${r.prev}", before "${r.next}")`);
  ok(r.below3 && r.above4, `${label}: image shows between paragraph 3 and paragraph 4 on screen`);
  ok(r.w > 0 && r.w <= r.edW, `${label}: image visible and within the note width (${Math.round(r.w)} of ${r.edW}px)`);
  await ctx.close();
}

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  await run(b, base, { width: 360, height: 730 }, 'phone 360px, first open', 1);
  await run(b, base, { width: 360, height: 730 }, 'phone 360px, reopen', 2);
  await run(b, base, { width: 390, height: 844 }, 'phone 390px, first open', 1);
  // desktop must be unchanged: the block stays pinned at its saved spot
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
  await p.route(/supabase\.co|script\.google\.com/, r => { const u = r.request().url();
    if (/\/storage\/v1\//.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (/\/rest\/v1\/notes\?/.test(u) && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([NOTE]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: /auth\/v1\/user/.test(u) ? JSON.stringify({ id: UID }) : '[]' }); });
  await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
  await p.goto(`${base}/notebook.html`); await p.waitForSelector('#notes li.nc', { state: 'attached', timeout: 8000 });
  await p.evaluate(() => document.querySelector('#notes li.nc').click()); await p.waitForTimeout(400);
  const d = await p.evaluate(() => { const e = document.getElementById('ed'), f = e.querySelector('div.float.pic'), s = getComputedStyle(f);
    return { flow: e.classList.contains('flow'), pos: s.position, left: f.style.left, top: f.style.top }; });
  ok(!d.flow && d.pos === 'absolute' && d.left === '420px' && d.top === '60px', `desktop 1440px: image block pinned at its saved spot (${d.pos} ${d.left},${d.top})`);
  await ctx.close();
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
