// Corrector: the accented word comes first in the suggestions — BR-20261111-100715-01f3.
// Runs Notas' own spell worker (the script in #spellWorkerSrc) in Chromium with the real Hunspell dictionaries and checks
// that a word missing its accent gets the accented word first, within the 5 the right-click menu shows.
// Run: DICT_DIR=<dir> node tools/tests/spell-accent-suggestions.test.js
//   DICT_DIR holds dictionary-es-4.0.0/package/index.{aff,dic} and dictionary-en-4.0.0/package/index.{aff,dic}
//   (get them with: cd <dir> && npm pack dictionary-es@4.0.0 dictionary-en@4.0.0 && for f in *.tgz; do mkdir -p ${f%.tgz}; tar xzf $f -C ${f%.tgz}; done)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const DICT = process.env.DICT_DIR;
if (!DICT || !fs.existsSync(path.join(DICT, 'dictionary-es-4.0.0/package/index.aff'))) { console.log('SKIP: set DICT_DIR (see header)'); process.exit(0); }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const src = fs.readFileSync(path.join(ROOT, 'notebook.html'), 'utf8').match(/<script type="text\/plain" id="spellWorkerSrc">([\s\S]*?)<\/script>/)[1];

(async () => {
  const b = await chromium.launch(), ctx = await b.newContext(), p = await ctx.newPage();
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/dictionary-(es|en)@4\.0\.0\/index\.(aff|dic)/, r => {
    const [, l, x] = r.request().url().match(/dictionary-(es|en)@4\.0\.0\/index\.(aff|dic)/);
    r.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(DICT, `dictionary-${l}-4.0.0/package/index.${x}`)) });
  });
  await p.setContent('<p>spell</p>');
  const ask = (word, langs) => p.evaluate(async ([src, word, langs]) => {
    if (!window.__w) { window.__w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); window.__n = 0; }
    const id = ++window.__n;
    return await new Promise(res => { const h = e => { if (e.data.id === id) { window.__w.removeEventListener('message', h); res(e.data); } }; window.__w.addEventListener('message', h); window.__w.postMessage({ type: 'suggest', id, word, langs }); });
  }, [src, word, langs]);
  // what the menu shows: worker list, minus the word itself, first 5 (spellMenu in notebook.html)
  const menu = async (w, l) => { const r = await ask(w, [l]); if (r.type === 'error') throw new Error(r.msg); return (r.list || []).filter(x => x !== w).slice(0, 5); };
  for (const [w, want] of [['musica', 'música'], ['rapido', 'rápido'], ['arbol', 'árbol'], ['Musica', 'Música'], ['cancion', 'canción'], ['espanol', 'español']]) {
    const m = await menu(w, 'es');
    ok(m[0] === want, `es "${w}": "${want}" is the first suggestion (menu: ${m.join(', ')})`);
  }
  { const m = await menu('pinguino', 'es'); ok(!m.length || m[0] !== 'pinguino', `es "pinguino": no crash, menu: ${m.join(', ') || '(none)'}`); }
  { const m = await menu('teh', 'en'); ok(m.length && m.every(w => !/[áéíóúüñ]/.test(w)), `en "teh": English suggestions get no accented words (menu: ${m.join(', ')})`); }
  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
