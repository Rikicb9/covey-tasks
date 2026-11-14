// Notes whose first line is loose text keep their formatting — BR-20261114-123813-dff9.
// If the editor's first line is a bare text node (not wrapped in <p>), the saved body starts with text instead of "<".
// It was then taken for an old Markdown note on the next open and every tag was shown as literal text ("<ul><li>…").
// Run: node tools/tests/body-leading-text.test.js   (needs Playwright + Chromium; serves the repo locally, Supabase mocked)
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
const UID = '00000000-0000-0000-0000-000000000001';
const note = (id, body) => ({ id, folder_id: null, title: 'Test ' + id.slice(-2), body, tags: [], version: 1, updated_at: '2026-11-14T09:00:00Z', title_sep: true, pinned: false });
// as saved by an editor whose first line was a bare text node (generic words, not user content)
const BROKEN = note('00000000-0000-0000-0000-0000000000a1', 'Town A:<ul><li>one</li><li>two</li></ul><p>Town B</p><ul><li>three&nbsp;</li></ul>');
// a real old Markdown note must still render as Markdown
const LEGACY = note('00000000-0000-0000-0000-0000000000a2', 'Shopping\n- milk\n- bread\n\nCall **Ana** if 2 < 3');

async function page(b, base, vp) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 820, isMobile: vp.width < 820 });
  const p = await ctx.newPage(); const saved = [];
  await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
  await p.route(/supabase\.co|script\.google\.com/, r => {
    const u = r.request().url(), m = r.request().method();
    if (/\/auth\/v1\/user/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, email: 'test@example.com' }) });
    if (/\/rest\/v1\/notes/.test(u) && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BROKEN, LEGACY]) });
    if (/\/rest\/v1\/notes/.test(u) && (m === 'PATCH' || m === 'POST')) { try { saved.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
  await p.goto(`${base}/notebook.html`);
  await p.waitForSelector('#notes li.nc', { state: 'attached', timeout: 8000 });
  await p.waitForTimeout(300);
  return { ctx, p, saved };
}
const open = (p, i) => p.evaluate(i => document.querySelectorAll('#notes li.nc')[i].click(), i).then(() => p.waitForTimeout(400));
const which = (p, id) => p.evaluate(id => [...document.querySelectorAll('#notes li.nc')].findIndex(li => (li.dataset.id || li.getAttribute('data-id')) === id), id);

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  for (const [vp, label] of [[{ width: 390, height: 475 }, 'phone 390px'], [{ width: 1440, height: 900 }, 'desktop 1440px']]) {
    const { ctx, p } = await page(b, base, vp);
    const titles = await p.evaluate(() => [...document.querySelectorAll('#notes li.nc')].map(li => li.textContent));
    const iB = titles.findIndex(t => /Test a1/.test(t)), iL = titles.findIndex(t => /Test a2/.test(t));
    // 1. a body saved with loose text first opens as formatted HTML
    await open(p, iB < 0 ? 0 : iB);
    const r = await p.evaluate(() => { const e = document.getElementById('ed'); return { text: e.textContent, lis: e.querySelectorAll('ul>li').length, first: (e.firstElementChild || {}).tagName }; });
    ok(!/<\/?(ul|li|p)>|&nbsp;/.test(r.text), `${label}: no HTML tags shown as text`);
    ok(r.lis === 3, `${label}: the two lists render as lists (${r.lis} items)`);
    ok(/Town A/.test(r.text) && r.first === 'P', `${label}: the loose first line shows as an ordinary paragraph (first block ${r.first})`);
    if (vp.width < 820) { await p.evaluate(() => history.back()); await p.waitForTimeout(400); }
    // 2. old Markdown notes still render as Markdown
    await open(p, iL < 0 ? 1 : iL);
    const m = await p.evaluate(() => { const e = document.getElementById('ed'); return { lis: e.querySelectorAll('ul>li').length, bold: !!e.querySelector('b,strong'), text: e.textContent }; });
    ok(m.lis === 2 && m.bold && /2 < 3/.test(m.text), `${label}: legacy Markdown note still renders (list ${m.lis}, bold ${m.bold})`);
    await ctx.close();
  }
  // 3. the editor never saves a body that starts with loose text
  for (const how of ['dom', 'keys']) {
    const { ctx, p, saved } = await page(b, base, { width: 390, height: 475 });
    await open(p, 0);
    if (how === 'dom') { // what iOS Safari can leave after the first paragraph is removed and the line retyped
      await p.evaluate(() => { const e = document.getElementById('ed'); e.innerHTML = 'Loose line<ul><li>x</li></ul><p>y</p>'; e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'e' })); });
    } else { // select all, delete, type a line and a list
      await p.click('#ed'); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace');
      await p.keyboard.type('Loose line'); await p.keyboard.press('Enter'); await p.keyboard.type('- x');
    }
    await p.waitForTimeout(2500);
    const last = [...saved].reverse().find(s => typeof s.body === 'string');
    const h = last ? last.body : '';
    ok(!!last && /^\s*</.test(h), `save (${how}): stored body starts with a tag (${JSON.stringify(h.slice(0, 24))})`);
    if (how === 'dom') ok(/^<p>Loose line<\/p><ul>/.test(h), 'save (dom): loose first line is wrapped in its own paragraph');
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})();
