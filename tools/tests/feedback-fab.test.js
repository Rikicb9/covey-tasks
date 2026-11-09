// Bug report button (feedback.js) visibility checks — BR-20261109-102610-d65f.
// Run: node tools/tests/feedback-fab.test.js   (needs Playwright + Chromium; serves the repo locally, Supabase and Apps Script are mocked)
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
function lum(rgb) { const c = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  for (const [page, vp] of [['notebook.html', { width: 1440, height: 900 }], ['index.html', { width: 1440, height: 900 }], ['notebook.html', { width: 390, height: 844 }], ['index.html', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 820 });
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('covey-session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: Date.now() + 864e5, user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } })));
    await p.route(/supabase\.co|script\.google\.com/, r => r.fulfill({ status: 200, contentType: 'application/json',
      body: /\/auth\/v1\/user/.test(r.request().url()) ? JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' }) : '[]' }));
    await p.route(/fonts\.(googleapis|gstatic)\.com|cdn/, r => r.abort());
    await p.goto(`${base}/${page}`); await p.waitForSelector('#fbFab', { state: 'attached', timeout: 8000 });
    await p.waitForTimeout(300);
    const tag = `${page} @${vp.width}px`;
    const m = await p.$eval('#fbFab', el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(), svg = el.querySelector('svg');
      return { w: r.width, h: r.height, op: +s.opacity, bg: s.backgroundColor, fg: getComputedStyle(svg).color, label: (el.innerText || '').trim(),
        right: innerWidth - r.right, bottom: innerHeight - r.bottom, aria: el.getAttribute('aria-label') }; });
    const desktop = vp.width >= 820;
    ok(m.op === 1, `${tag}: button fully opaque (opacity ${m.op})`);
    ok(Math.min(m.w, m.h) >= 44, `${tag}: at least 44 px tall/wide (${m.w}×${m.h})`);
    ok(lum(m.bg) < 0.3, `${tag}: filled accent background, stands out from white pages (${m.bg})`);
    ok(contrast(m.fg, m.bg) >= 4.5, `${tag}: icon contrast ≥ 4.5:1 (${contrast(m.fg, m.bg).toFixed(2)})`);
    ok(desktop ? m.label.length > 0 : m.label === '', `${tag}: ${desktop ? 'visible text label "' + m.label + '"' : 'icon only on phones'}`);
    if (!desktop) ok(m.w <= 60, `${tag}: compact on phones (${m.w}px wide)`);
    ok(!!m.aria, `${tag}: aria-label "${m.aria}"`);
    ok(m.right >= 8 && m.bottom >= 8, `${tag}: inside the viewport (right ${m.right}, bottom ${m.bottom})`);
    await p.click('#fbFab'); ok(await p.isVisible('#fbPanel'), `${tag}: click opens the panel`);
    ok(!(await p.isVisible('#fbFab')), `${tag}: button hidden while the panel is open`);
    await p.keyboard.press('Escape'); ok(await p.isVisible('#fbFab'), `${tag}: Esc closes the panel, button back`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${page.replace('.html', '')}-${vp.width}.png`) });
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
