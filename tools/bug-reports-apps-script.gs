/**
 * Covey bug reports: receiver (Google Apps Script web app).
 * Receives the reports sent by the 🐞 button in Covey Tasks and Notas, saves each one as a row
 * in the "Covey bug reports" sheet, and saves its screenshots in the "Covey bug screenshots" folder.
 *
 * Setup (once, about 5 minutes):
 *  1. Open the "Covey bug reports" sheet → Extensions → Apps Script. Replace the code with this file and save.
 *  2. Project Settings (gear) → Script properties → add:
 *       SUPABASE_ANON_KEY = the public anon key (the same one in index.html, SB_ANON)
 *       ALLOWED_EMAILS    = (optional) comma-separated login emails allowed to send; empty = any signed-in user of the app
 *  3. Deploy → New deployment → type "Web app" → Execute as: Me · Who has access: Anyone → Deploy.
 *     Authorise when asked (it needs the sheet, Drive for the screenshots, and outside requests to check the login).
 *  4. Copy the Web app URL (ends in /exec) and give it to the team: it goes in feedback.js (ENDPOINT).
 *
 * Security: "Anyone" is needed because the browser can't send a Google login. Instead, every report must carry
 * the app's own login token, checked here against Supabase; reports without a valid login are refused.
 * Note content is never sent automatically: only what the person writes and the screenshots they attach.
 */
const SHEET_ID = '1_uUjynPkHDXGKOhttuFBPxj4IyE4KbYV1M2n3pcs8R0';
const FOLDER_ID = '1l3wnBM0NB9T-WMfgTQcT5vkSjhUa1SEL';
const SUPABASE_URL = 'https://erosmwvmalyogiptuywm.supabase.co';
const MAX_SHOTS = 3, MAX_SHOT_BYTES = 3 * 1024 * 1024, MAX_TEXT = 5000;
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = checkLogin_(d.token);
    if (!user) return out_({ ok: false, error: 'auth' });

    const message = String(d.message || '').trim().slice(0, MAX_TEXT);
    const shots = Array.isArray(d.shots) ? d.shots.slice(0, MAX_SHOTS) : [];
    if (!message && !shots.length) return out_({ ok: false, error: 'empty' });

    const id = 'BR-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd-HHmmss') + '-' +
      Utilities.getUuid().slice(0, 4);
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const links = [];
    shots.forEach(function (s, i) {
      const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(s || ''));
      if (!m) return; // only screenshots (images) are accepted
      const bytes = Utilities.base64Decode(m[2]);
      if (bytes.length > MAX_SHOT_BYTES) return;
      const f = folder.createFile(Utilities.newBlob(bytes, m[1], id + '-' + (i + 1) + '.' + IMAGE_TYPES[m[1]]));
      links.push(f.getUrl());
    });

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      SpreadsheetApp.openById(SHEET_ID).getSheets()[0].appendRow([
        id,
        new Date().toISOString(),
        safe_(d.app), safe_(d.version), safe_(d.screen), safe_(d.device),
        safe_(message),
        links.join('\n'),
        'new', '', '', '', '', '', ''
      ]);
    } finally { lock.releaseLock(); }
    return out_({ ok: true, id: id, shots: links.length });
  } catch (err) {
    return out_({ ok: false, error: 'server' });
  }
}

function doGet() { return out_({ ok: true, service: 'covey-bug-reports' }); }

function checkLogin_(token) {
  if (!token) return null;
  const anon = PropertiesService.getScriptProperties().getProperty('SUPABASE_ANON_KEY');
  const r = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: anon, Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return null;
  const user = JSON.parse(r.getContentText());
  const allowed = (PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
  if (allowed.length && allowed.indexOf(String(user.email || '').toLowerCase()) < 0) return null;
  return user;
}

// Text that starts with = + - @ would run as a formula in the sheet: keep it as plain text.
function safe_(v) {
  const s = String(v == null ? '' : v).slice(0, MAX_TEXT);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
