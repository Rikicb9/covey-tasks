/* Covey bug reports (shared by Covey Tasks and Notas) — v1.0, 2026-11-08
   A small floating 🐞 button on every screen opens a chat-style panel: describe the problem, attach up to
   3 screenshots (images only), send. Reports go to a Google Apps Script web app that saves them in the
   "Covey bug reports" sheet (see tools/bug-reports-apps-script.gs). Nothing is sent automatically:
   only the text and screenshots the person adds, plus app, version, screen and device. */
(function () {
  'use strict';
  const ENDPOINT = ''; // Apps Script web app URL (…/exec). Empty = the button stays hidden.
  const MAX_SHOTS = 3, MAX_SIDE = 1600, MAX_TEXT = 5000;
  const DRAFT_KEY = 'covey-bug-draft';
  if (window.__coveyFeedback) return; window.__coveyFeedback = true;
  const endpoint = () => window.COVEY_FEEDBACK_ENDPOINT || ENDPOINT; // tests can point it elsewhere

  const css = `
#fbFab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:900;width:40px;height:40px;border-radius:50%;
  border:1px solid rgba(0,0,0,.08);background:#fff;color:#57534e;box-shadow:0 2px 10px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;
  cursor:pointer;opacity:.72;transition:opacity .15s,transform .15s;padding:0;-webkit-tap-highlight-color:transparent}
#fbFab:hover,#fbFab:focus-visible{opacity:1;transform:scale(1.05)}
#fbFab:focus-visible{outline:2px solid #4f46e5;outline-offset:2px}
#fbFab svg{width:20px;height:20px}
body.fb-typing #fbFab,body.focus #fbFab,body.fb-open #fbFab{display:none}
@media (max-width:819px){#fbFab{bottom:calc(88px + env(safe-area-inset-bottom,0px));right:14px;width:38px;height:38px}}
@media print{#fbFab,#fbPanel{display:none!important}}
#fbPanel{position:fixed;right:16px;bottom:16px;z-index:1000;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 32px));
  background:#fff;color:#1c1917;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;
  font:14px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
#fbPanel.show{display:flex}
@media (max-width:819px){#fbPanel{inset:auto 0 0 0;width:100%;height:min(88vh,calc(var(--app-h,100vh) - 24px));border-radius:16px 16px 0 0;
  padding-bottom:env(safe-area-inset-bottom,0px)}}
#fbPanel .fbh{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 16px;border-bottom:1px solid #eee}
#fbPanel .fbh b{flex:1;font-size:15px}
#fbPanel .fbx{border:0;background:none;width:32px;height:32px;border-radius:8px;cursor:pointer;color:#57534e;font-size:20px;line-height:1}
#fbPanel .fbx:hover{background:#f5f5f4}
#fbLog{flex:1;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px;background:#fafaf9}
.fbm{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.fbm.bot{align-self:flex-start;background:#fff;border:1px solid #eee;border-bottom-left-radius:4px}
.fbm.warn{align-self:flex-start;background:#fffbeb;border:1px solid #fde68a;color:#78350f;border-bottom-left-radius:4px}
.fbm.me{align-self:flex-end;background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
.fbm.err{align-self:flex-start;background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
.fbm .fbimgs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.fbm .fbimgs img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.4)}
.fbctx{font-size:11.5px;color:#78716c;padding:6px 14px;border-top:1px solid #f0f0f0}
#fbThumbs{display:flex;gap:8px;padding:8px 12px 0;flex-wrap:wrap}
#fbThumbs:empty{display:none}
#fbThumbs .t{position:relative}
#fbThumbs img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #e7e5e4;display:block}
#fbThumbs button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:#1c1917;color:#fff;font-size:12px;line-height:20px;cursor:pointer;padding:0}
.fbin{display:flex;align-items:flex-end;gap:6px;padding:10px 12px 12px}
#fbText{flex:1;resize:none;border:1px solid #e7e5e4;border-radius:12px;padding:9px 11px;font:inherit;min-height:42px;max-height:140px;outline:none;background:#fff;color:inherit}
#fbText:focus{border-color:#a5b4fc;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.fbbtn{border:0;border-radius:10px;height:42px;min-width:42px;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
#fbAttach{background:#f5f5f4;color:#44403c}
#fbAttach:hover{background:#e7e5e4}
#fbSend{background:#4f46e5;color:#fff;padding:0 14px}
#fbSend:disabled{opacity:.45;cursor:default}
#fbFile{display:none}
@media (prefers-color-scheme:dark){html[data-theme=dark] #fbFab{background:#292524;color:#e7e5e4}}`;

  const BUG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>';
  const CLIP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></svg>';

  let shots = [], sending = false, lastFocus = null;

  function ctx() {
    const nb = /notebook\.html/.test(location.pathname);
    const verEl = document.getElementById(nb ? 'ver' : 'version-badge');
    let screen = '';
    try { screen = typeof window.coveyFeedbackScreen === 'function' ? String(window.coveyFeedbackScreen()) : ''; } catch (e) {}
    if (!screen && !nb) { const a = document.querySelector('.tab-btn.active'); screen = a ? a.textContent.replace(/\s+/g, ' ').trim() : ''; }
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'other';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'other';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? ' · app instalada' : '';
    return {
      app: nb ? 'Notas' : 'Covey Tasks',
      version: verEl ? verEl.textContent.trim() : '',
      screen: screen || (nb ? 'Notas' : 'Covey'),
      device: `${os} · ${br} · ${innerWidth}×${innerHeight}${standalone}`
    };
  }
  function token() { try { return (JSON.parse(localStorage.getItem('covey-session') || 'null') || {}).access_token || ''; } catch (e) { return ''; } }
  const $ = id => document.getElementById(id);
  function bubble(kind, text, imgs) {
    const m = document.createElement('div'); m.className = 'fbm ' + kind; m.textContent = text;
    if (imgs && imgs.length) { const w = document.createElement('div'); w.className = 'fbimgs'; imgs.forEach(s => { const i = new Image(); i.src = s; i.alt = 'Captura'; w.appendChild(i); }); m.appendChild(w); }
    $('fbLog').appendChild(m); $('fbLog').scrollTop = $('fbLog').scrollHeight; return m;
  }
  function greet() {
    $('fbLog').innerHTML = '';
    bubble('bot', '¿Qué ha fallado? Cuéntanos qué estabas haciendo, qué esperabas y qué pasó. Puedes adjuntar capturas de pantalla (solo imágenes).');
    bubble('warn', '⚠️ No incluyas datos confidenciales: nada de contraseñas, datos de salud ni información personal o de clientes. Recorta o tapa esa parte de la captura antes de adjuntarla.');
  }
  function refresh() {
    const t = $('fbText').value.trim();
    $('fbSend').disabled = sending || (!t && !shots.length);
    const box = $('fbThumbs'); box.innerHTML = '';
    shots.forEach((s, i) => {
      const d = document.createElement('div'); d.className = 't';
      const im = new Image(); im.src = s; im.alt = 'Captura ' + (i + 1);
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Quitar captura'; x.setAttribute('aria-label', 'Quitar captura ' + (i + 1));
      x.onclick = () => { shots.splice(i, 1); refresh(); };
      d.append(im, x); box.appendChild(d);
    });
    $('fbAttach').disabled = shots.length >= MAX_SHOTS;
    $('fbAttach').title = shots.length >= MAX_SHOTS ? 'Máximo ' + MAX_SHOTS + ' capturas' : 'Adjuntar captura de pantalla';
    const c = ctx(); $('fbCtx').textContent = `Se adjunta también: ${c.app} ${c.version} · ${c.screen} · ${c.device}`;
    try { localStorage.setItem(DRAFT_KEY, $('fbText').value); } catch (e) {}
  }
  function shrink(file) { // screenshots only; scaled so the longest side is at most 1600 px
    return new Promise((res, rej) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return rej(new Error('type'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  async function addFiles(files) {
    let bad = 0;
    for (const f of files) {
      if (shots.length >= MAX_SHOTS) { bubble('err', 'Puedes adjuntar como máximo ' + MAX_SHOTS + ' capturas.'); break; }
      try { shots.push(await shrink(f)); } catch (e) { bad++; }
    }
    if (bad) bubble('err', 'Solo se pueden adjuntar capturas de pantalla (PNG, JPG o WebP).');
    refresh();
  }
  async function send() {
    const text = $('fbText').value.trim().slice(0, MAX_TEXT);
    if (sending || (!text && !shots.length)) return;
    sending = true; refresh();
    const sent = shots.slice();
    bubble('me', text || '(solo capturas)', sent);
    const wait = bubble('bot', 'Enviando…');
    try {
      const r = await fetch(endpoint(), { method: 'POST', body: JSON.stringify({ ...ctx(), message: text, shots: sent, token: token() }) }); // text/plain: no CORS preflight
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'fail');
      wait.textContent = `Recibido (${j.id}). Gracias: el equipo lo revisará. Si quieres, cuéntanos algo más.`;
      $('fbText').value = ''; shots = [];
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    } catch (e) {
      wait.className = 'fbm err';
      wait.textContent = e.message === 'auth' ? 'No se pudo enviar: tu sesión ha caducado. Vuelve a entrar en la app y reenvíalo (el texto se conserva).'
        : 'No se pudo enviar (¿sin conexión?). El texto y las capturas se conservan: pulsa Enviar para reintentar.';
    }
    sending = false; refresh();
  }
  function open() {
    if (!$('fbPanel').classList.contains('show')) {
      lastFocus = document.activeElement;
      $('fbPanel').classList.add('show'); document.body.classList.add('fb-open');
      if (!$('fbLog').children.length) greet();
      refresh();
    }
    setTimeout(() => $('fbText').focus(), 30);
  }
  function close() {
    $('fbPanel').classList.remove('show'); document.body.classList.remove('fb-open');
    if (lastFocus && lastFocus.focus && lastFocus.isConnected) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  function build() {
    if (!endpoint() || $('fbFab')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const fab = document.createElement('button');
    fab.id = 'fbFab'; fab.type = 'button'; fab.title = 'Reportar un problema'; fab.setAttribute('aria-label', 'Reportar un problema'); fab.innerHTML = BUG;
    fab.onclick = open;
    const p = document.createElement('div');
    p.id = 'fbPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'false'); p.setAttribute('aria-label', 'Reportar un problema');
    p.innerHTML = `<div class="fbh"><b>Reportar un problema</b><button class="fbx" type="button" id="fbClose" title="Cerrar (Esc)" aria-label="Cerrar">×</button></div>
      <div id="fbLog" aria-live="polite"></div><div id="fbThumbs"></div>
      <div class="fbin"><button class="fbbtn" id="fbAttach" type="button" aria-label="Adjuntar captura de pantalla">${CLIP}</button>
      <textarea id="fbText" rows="1" maxlength="${MAX_TEXT}" placeholder="Describe el problema…" aria-label="Describe el problema"></textarea>
      <button class="fbbtn" id="fbSend" type="button">Enviar</button></div>
      <div class="fbctx" id="fbCtx"></div><input type="file" id="fbFile" accept="image/png,image/jpeg,image/webp" multiple>`;
    document.body.append(fab, p);
    try { $('fbText').value = localStorage.getItem(DRAFT_KEY) || ''; } catch (e) {}
    $('fbClose').onclick = close;
    $('fbSend').onclick = send;
    $('fbAttach').onclick = () => $('fbFile').click();
    $('fbFile').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
    $('fbText').addEventListener('input', () => { const t = $('fbText'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; refresh(); });
    $('fbText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    p.addEventListener('paste', e => { const f = [...(e.clipboardData || {}).files || []].filter(x => /^image\//.test(x.type)); if (f.length) { e.preventDefault(); addFiles(f); } });
    p.addEventListener('dragover', e => e.preventDefault());
    p.addEventListener('drop', e => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
    // Esc closes the panel first (capture: before the app's own Esc handling)
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && p.classList.contains('show')) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
    // phones: hide the button while typing in the app (keyboard open)
    const typing = () => { const a = document.activeElement; document.body.classList.toggle('fb-typing', innerWidth < 820 && !!a && !p.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))); };
    document.addEventListener('focusin', typing); document.addEventListener('focusout', () => setTimeout(typing, 0));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
