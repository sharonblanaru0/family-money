import * as C from './crypto.js';
import * as Store from './store.js';
import * as GH from './github.js';
import * as M from './model.js';
import {lineChart} from './charts.js';

const {TYPES, TYPE_ORDER, money, NUM, pct, dstr, MON_FULL, esc, isoDay} = M;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const DATA_PATH = 'vault.json';
const LOCK_AFTER_MS = 5 * 60 * 1000;
const HIDDEN_LOCK_MS = 60 * 1000;

let S = null;   // unlocked session, null while locked: {device, key, salt, iterations, vault, sha, source, fetchedAt, dirty}
const ui = {tab: 'overview', kid: null, editMode: 'balances', structure: null, pairCode: null};

/* ---------- icons ---------- */
const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 2.6),
  down: svg('<path d="M12 5v14M5 12l7 7 7-7"/>', 2.6),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  bang: svg('<path d="M12 6v8"/><path d="M12 18.5v.01"/>', 3.2),
  chev: svg('<path d="M15 6l-6 6 6 6"/>', 2.4).replace('<svg ', '<svg class="chev" '),
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1z" fill="currentColor"/><path d="M12 9.5v5" stroke="#14213D" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="#14213D"/></svg>',
  boy: svg('<circle cx="12" cy="9" r="4.2"/><path d="M7.8 8.6c0-2.6 1.9-4.6 4.2-4.6s4.2 2 4.2 4.6c-1.5-.1-3-.8-3.9-2-1.1 1.2-2.7 1.9-4.5 2z" fill="currentColor"/><path d="M4.5 20.5c.6-3.9 3.7-6.3 7.5-6.3s6.9 2.4 7.5 6.3"/>', 1.8),
  girl: svg('<circle cx="12" cy="9" r="4.2"/><path d="M7.8 8.6c0-2.6 1.9-4.6 4.2-4.6s4.2 2 4.2 4.6c-1.7 0-3.3-.9-4.2-2.3-.9 1.4-2.5 2.3-4.2 2.3z" fill="currentColor"/><path d="M16 6.3c1.9-.6 3.6.6 3.8 2.5.2 1.7-.8 3.4-2.4 4"/><circle cx="16.2" cy="6" r="1.2" fill="currentColor"/><path d="M4.5 20.5c.6-3.9 3.7-6.3 7.5-6.3s6.9 2.4 7.5 6.3"/>', 1.8),
};
const kidIcon = m => `<span class="kicon ${m.gender === 'f' ? 'f' : 'm'}" aria-label="${m.gender === 'f' ? 'בת' : 'בן'}">${m.gender === 'f' ? I.girl : I.boy}</span>`;

/* ---------- guilloché rosettes (security-print motif) ---------- */
function ring(cx, cy, R, A, B, n, m, ph, steps) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps * Math.PI * 2, r = R + A * Math.sin(n * t + ph) + B * Math.sin(m * t - ph * 1.7);
    d += (i ? 'L' : 'M') + (cx + r * Math.cos(t)).toFixed(1) + ' ' + (cy + r * Math.sin(t)).toFixed(1);
  }
  return d + 'Z';
}
function rosette({c = 100, R = 70, A = 10, B = 4, n = 9, m = 18, layers = 20, steps = 300, cls = '', draw = false}) {
  let s = '';
  for (let k = 0; k < layers; k++) {
    s += `<path ${cls ? `class="${cls}"` : ''} ${draw ? `pathLength="1" style="animation-delay:${k * 28}ms"` : ''} d="${ring(c, c, R, A, B, n, m, k * Math.PI * 2 / layers, steps)}"/>`;
  }
  return s;
}
const MARK = rosette({R: 58, A: 30, B: 0, n: 6, m: 12, layers: 3, steps: 180});
const GATE_ROS = `<svg class="ros draw" viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width=".6" aria-hidden="true">${rosette({R: 74, A: 13, B: 4, n: 12, m: 24, layers: 22, steps: 320, cls: 'o', draw: true}) + rosette({R: 40, A: 7, B: 2.5, n: 8, m: 16, layers: 14, steps: 220, draw: true})}</svg>`;
const CHIP = `<svg class="chipc" viewBox="0 0 42 32" aria-hidden="true"><defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1DEA6"/><stop offset=".5" stop-color="#C8A85B"/><stop offset="1" stop-color="#EAD496"/></linearGradient></defs><rect x=".5" y=".5" width="41" height="31" rx="6" fill="url(#cg)" stroke="rgba(0,0,0,.2)"/><path d="M0 11h13M0 21h13M29 11h13M29 21h13M13 0v32M29 0v32M13 16h16" stroke="rgba(80,60,20,.38)" fill="none"/></svg>`;
const CONTACTLESS = svg('<path d="M8 8.5a5 5 0 0 1 0 7"/><path d="M11.5 6a8.5 8.5 0 0 1 0 12"/><path d="M15 3.5a12 12 0 0 1 0 17"/>', 1.8).replace('<svg ', '<svg class="cl" ');

/* ---------- small helpers ---------- */
const today = () => new Date();
const isOwner = () => S && S.device.role === 'owner';
const members = () => S.vault.members;
const kids = () => S.vault.members.filter(m => m.kind === 'child');
const ownerName = id => members().find(m => m.id === id)?.name || '';
const titleOf = a => a.type === 'realestate' ? (a.name || 'נכס') : (a.inst || a.name || M.prodName(a));
const subOf = a => (a.type === 'realestate' ? 'שווי משוער' : (a.inst || a.name) ? M.prodName(a) : 'הגוף המנהל לא ידוע') + ', ' + ownerName(a.owner);
const monoOf = a => { const t = titleOf(a).replace(/^בנק /, ''); return a.inst || a.type === 'realestate' || a.name ? t.charAt(0) : '?'; };
const feeStr = f => f == null ? '—' : f.toFixed(2) + '%';
const typedTitle = a => { const t = titleOf(a), l = TYPES[a.type].label; return t.startsWith(l) ? t : `${l}: ${t}`; };
const signed = v => `<span class="amt" dir="ltr">${v >= 0 ? '+' : '-'}${NUM.format(Math.abs(Math.round(v)))}</span>`;
const LIQ = {
  now: {label: 'זמין עכשיו', c: 'var(--s1)'},
  later: {label: 'זמין בהמשך', c: 'var(--s2)'},
  pension: {label: 'בפרישה', c: 'var(--s3)'},
  property: {label: 'נדל״ן', c: 'var(--prop)'},
};

function uiErr(message, kind) { const e = new Error(message); e.ui = true; e.kind = kind; return e; }
const SYNC_MSG = {
  offline: 'אין חיבור לאינטרנט',
  'bad-token': 'הטוקן לא תקף או שפג תוקפו',
  forbidden: 'לטוקן אין הרשאה מתאימה למאגר',
  'not-found': 'המאגר לא נמצא, או שלטוקן אין גישה אליו',
  conflict: 'הקובץ השתנה בזמן השמירה. נסו שוב',
  server: 'GitHub לא זמין כרגע. נסו שוב בעוד כמה דקות',
};
const messageOf = e => e.ui ? e.message : e instanceof GH.SyncError ? SYNC_MSG[e.code] : 'משהו השתבש: ' + (e.message || e);

function defaultRepo() {
  const h = location.hostname;
  return h.endsWith('.github.io') ? `${h.split('.')[0]}/family-money-data` : '';
}
const b64url = s => C.toB64(new TextEncoder().encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return new TextDecoder().decode(C.fromB64(t + '='.repeat((4 - t.length % 4) % 4))); };

function parseJoinCode(text) {
  let t = (text || '').trim();
  const i = t.indexOf('#pair=');
  if (i >= 0) t = t.slice(i + 6);
  if (t.startsWith('fm1.')) {
    try { return {kind: 'pair', env: JSON.parse(unb64url(t.slice(4)))}; } catch { return null; }
  }
  if (/^(github_pat_|ghp_)\w{20,}$/.test(t)) return {kind: 'token', token: t};
  return null;
}

async function sealDevice(device, key, salt, iterations) {
  await Store.set('device', await C.seal(device, key, salt, 'device', iterations));
}

/* ---------- toast + sheet ---------- */
let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2600);
}
function openSheet(html) {
  const sh = $('#sheet');
  sh.innerHTML = '<div class="grab"></div>' + html;
  $('#scrim').classList.add('on');
  sh.classList.add('on');
}
function closeSheet() { $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on'); }
function busy(form, label) {
  const b = form.querySelector('button[type=submit]');
  if (b) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; }
}
function unbusy(form) {
  const b = form.querySelector('button[type=submit]');
  if (b && b.dataset.label) { b.textContent = b.dataset.label; b.disabled = false; }
}

/* ---------- gates: setup and lock ---------- */
function showGate(id) {
  $('#setup').hidden = id !== 'setup';
  $('#lock').hidden = id !== 'lock';
  $('#app').hidden = !!id;
  if (id) { closeSheet(); $('#float').hidden = true; }
}

function showSetup(step, opts = {}) {
  showGate('setup');
  const el = $('#setup');
  if (step === 'welcome') {
    el.innerHTML = `${GATE_ROS}
      <h2>הכסף שלנו</h2>
      <p class="lead">כדי להתחיל, מחברים את המכשיר לקובץ הנתונים המוצפן של המשפחה.</p>
      <div class="stack">
        <button class="btn" type="button" data-act="go-join">חיבור לנתונים קיימים</button>
        <button class="btn ghost" type="button" data-act="go-new">זה המכשיר הראשון: יצירת קובץ נתונים</button>
      </div>
      <p class="small">את ההגדרה הראשונה הכי נוח לעשות במחשב.<br>הסבר מלא נמצא בקובץ README במאגר של האפליקציה.</p>`;
  }
  if (step === 'join') {
    const code = opts.code || '';
    const parsed = parseJoinCode(code);
    el.innerHTML = `
      <form id="joinForm" class="stack" autocomplete="off">
        <h2>חיבור לנתונים קיימים</h2>
        <p class="lead">מדביקים את קישור הצירוף שנשלח מהמכשיר הראשון, ומזינים את הסיסמה המשפחתית.</p>
        <label class="field">קישור צירוף או טוקן גישה
          <textarea class="in code" id="jCode" rows="3" dir="ltr" spellcheck="false" autocapitalize="off" placeholder="https://…#pair=fm1.…">${esc(code)}</textarea></label>
        <div id="jManual" ${parsed?.kind === 'token' ? '' : 'hidden'}>
          <label class="field">מאגר הנתונים<input class="in" id="jRepo" dir="ltr" autocapitalize="off" value="${esc(defaultRepo())}" placeholder="owner/family-money-data"></label>
          <div class="field">המכשיר הזה
            <div class="seg-ctl" role="group" aria-label="תפקיד המכשיר">
              <button type="button" data-act="pick" data-role="viewer" aria-pressed="true">צפייה בלבד</button>
              <button type="button" data-act="pick" data-role="owner" aria-pressed="false">מעדכן ומפרסם</button>
            </div></div>
        </div>
        <label class="field">סיסמה משפחתית<input class="in" type="password" id="jPw" autocomplete="current-password"></label>
        <p class="err" id="jErr" role="alert"></p>
        <button class="btn" type="submit">חיבור</button>
        <button class="btn ghost" type="button" data-act="go-welcome">חזרה</button>
        <p class="small">באייפון: קודם מוסיפים את האתר למסך הבית, פותחים אותו משם, ורק אז מדביקים כאן את הקישור.</p>
      </form>`;
  }
  if (step === 'new') {
    ui.structure = null;
    el.innerHTML = `
      <form id="newForm" class="stack" autocomplete="off">
        <h2>יצירת קובץ נתונים</h2>
        <p class="lead">עושים את זה פעם אחת, במכשיר של מי שמעדכן את הנתונים.</p>
        <label class="field">מאגר הנתונים (פרטי)<input class="in" id="nRepo" dir="ltr" autocapitalize="off" value="${esc(defaultRepo())}" placeholder="owner/family-money-data"></label>
        <label class="field">טוקן גישה עם הרשאת כתיבה<input class="in" id="nToken" type="password" dir="ltr" autocomplete="off" placeholder="github_pat_…"></label>
        <label class="field">סיסמה משפחתית, לפחות 12 תווים<input class="in" id="nPw" type="password" autocomplete="new-password"></label>
        <button class="linkbtn" type="button" data-act="suggest">הצעת סיסמה חזקה</button>
        <div class="suggest" id="suggestBox" hidden></div>
        <label class="field">שוב את הסיסמה<input class="in" id="nPw2" type="password" autocomplete="new-password"></label>
        <label class="field">מבנה התחלתי (לא חובה)<input class="in" type="file" id="nFile" accept=".json,application/json"></label>
        <p class="hint" id="nFileNote">קובץ עם בני המשפחה והחשבונות, בלי סכומים. אפשר גם להתחיל ריק ולהוסיף הכל בעריכה.</p>
        <p class="err" id="nErr" role="alert"></p>
        <button class="btn" type="submit">יצירה והעלאה</button>
        <button class="btn ghost" type="button" data-act="go-welcome">חזרה</button>
        <p class="small">אין דרך לשחזר סיסמה שנשכחה. שומרים אותה במנהל הסיסמאות.</p>
      </form>`;
  }
}

function showLock() {
  showGate('lock');
  $('#lockErr').textContent = '';
  $('#reconnect').hidden = true;
  setTimeout(() => $('#pw').focus(), 50);
}

async function onJoin(form) {
  const err = $('#jErr');
  err.textContent = '';
  const parsed = parseJoinCode($('#jCode').value);
  const pw = $('#jPw').value;
  if (!parsed) { err.textContent = 'זה לא נראה כמו קישור צירוף או טוקן. בודקים שהועתק כל הטקסט.'; return; }
  if (!pw) { err.textContent = 'צריך להזין את הסיסמה המשפחתית.'; return; }
  busy(form, 'מתחבר');
  try {
    let device, key = null, keySalt = null;
    if (parsed.kind === 'pair') {
      key = await C.deriveKey(pw, C.saltOf(parsed.env), C.iterationsOf(parsed.env));
      try { device = await C.unseal(parsed.env, key, 'pair'); } catch { throw uiErr('הסיסמה לא נכונה, או שהקישור לא הועתק במלואו.'); }
      keySalt = parsed.env.kdf.salt;
    } else {
      const repo = $('#jRepo').value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw uiErr('שם המאגר צריך להיות בצורה owner/name.');
      device = {repo, path: DATA_PATH, token: parsed.token, role: $('#jManual [aria-pressed="true"]').dataset.role};
    }
    const remote = await GH.readVault(device);
    if (!remote) throw uiErr('במאגר הזה עוד אין קובץ נתונים. במכשיר הראשון בוחרים "יצירת קובץ נתונים".');
    if (remote.env.kdf.salt !== keySalt) key = await C.deriveKey(pw, C.saltOf(remote.env), C.iterationsOf(remote.env));
    let vault;
    try { vault = await C.unseal(remote.env, key, 'vault'); } catch { throw uiErr('הסיסמה לא נכונה.'); }
    await sealDevice(device, key, C.saltOf(remote.env), C.iterationsOf(remote.env));
    await Store.set('vault', {env: remote.env, sha: remote.sha, fetchedAt: Date.now()});
    startSession({device, key, env: remote.env, vault, sha: remote.sha, source: 'remote', fetchedAt: Date.now()});
    toast('המכשיר מחובר');
  } catch (e) {
    err.textContent = messageOf(e);
  } finally {
    unbusy(form);
  }
}

async function onNew(form) {
  const err = $('#nErr');
  err.textContent = '';
  const repo = $('#nRepo').value.trim(), token = $('#nToken').value.trim(), pw = $('#nPw').value, pw2 = $('#nPw2').value;
  const bad = !/^[\w.-]+\/[\w.-]+$/.test(repo) ? 'שם המאגר צריך להיות בצורה owner/name.'
    : !/^(github_pat_|ghp_)\w{20,}$/.test(token) ? 'הטוקן צריך להתחיל ב-github_pat_.'
    : pw.length < 12 ? 'הסיסמה צריכה להיות באורך 12 תווים לפחות.'
    : pw !== pw2 ? 'שתי הסיסמאות לא זהות.' : '';
  if (bad) { err.textContent = bad; return; }
  busy(form, 'יוצר ומעלה');
  try {
    const device = {repo, path: DATA_PATH, token, role: 'owner'};
    if (!(await GH.checkRepo(device)).private) throw uiErr('המאגר הזה ציבורי. קובץ הנתונים חייב להיות במאגר פרטי.');
    if (await GH.readVault(device)) throw uiErr('כבר יש קובץ נתונים במאגר הזה. כדי לא לדרוס אותו, חוזרים ובוחרים "חיבור לנתונים קיימים".');
    const vault = M.newVault(ui.structure || {});
    const salt = C.newSalt(), key = await C.deriveKey(pw, salt);
    const env = await C.seal(vault, key, salt, 'vault');
    const sha = await GH.writeVault(device, env, null);
    await sealDevice(device, key, salt, C.ITERATIONS);
    await Store.set('vault', {env, sha, fetchedAt: Date.now()});
    ui.structure = null;
    startSession({device, key, env, vault, sha, source: 'remote', fetchedAt: Date.now()});
    show('update');
    toast('קובץ הנתונים נוצר. אפשר להזין יתרות');
  } catch (e) {
    err.textContent = messageOf(e);
  } finally {
    unbusy(form);
  }
}

async function onStructureFile(input) {
  const note = $('#nFileNote');
  ui.structure = null;
  const f = input.files && input.files[0];
  if (!f) return;
  try {
    const s = M.validateStructure(JSON.parse(await f.text()));
    ui.structure = s;
    const nKids = s.members.filter(m => m.kind === 'child').length;
    note.textContent = `נטען: ${nKids} ילדים ו-${s.accounts.length} חשבונות. הסכומים מוזנים אחר כך, בעריכה.`;
  } catch {
    note.textContent = 'הקובץ לא במבנה הנכון. אפשר להתחיל ריק ולהוסיף הכל בעריכה.';
  }
}

async function onUnlock() {
  const pw = $('#pw').value;
  if (!pw) return;
  const b = $('#unlockBtn'), err = $('#lockErr');
  err.textContent = '';
  b.disabled = true;
  try {
    b.textContent = 'בודק סיסמה';
    const devEnv = await Store.get('device');
    const key0 = await C.deriveKey(pw, C.saltOf(devEnv), C.iterationsOf(devEnv));
    let device;
    try { device = await C.unseal(devEnv, key0, 'device'); } catch { throw uiErr('הסיסמה לא נכונה.', 'wrong'); }

    b.textContent = 'מוריד את הגרסה האחרונה';
    const cached = await Store.get('vault');
    let remote = null, syncErr = null;
    try { remote = await GH.readVault(device); } catch (e) { syncErr = e; }

    let env, sha, source;
    if (cached && cached.pending && (!remote || remote.sha === cached.baseSha)) {
      env = cached.env; sha = remote ? remote.sha : cached.baseSha; source = 'pending';
    } else if (remote) {
      env = remote.env; sha = remote.sha; source = 'remote';
    } else if (cached) {
      env = cached.env; sha = cached.sha; source = 'cache';
    } else {
      throw syncErr || uiErr('לא נמצא קובץ נתונים במאגר.');
    }

    b.textContent = 'מפענח';
    const key = C.sameSalt(env, devEnv) ? key0 : await C.deriveKey(pw, C.saltOf(env), C.iterationsOf(env));
    let vault;
    try { vault = await C.unseal(env, key, 'vault'); } catch { throw uiErr('הסיסמה של הנתונים שונתה במכשיר אחר. מחברים את המכשיר מחדש עם קישור צירוף חדש.', 'changed'); }
    if (source === 'remote') await Store.set('vault', {env, sha, fetchedAt: Date.now()});
    if (!C.sameSalt(env, devEnv)) await sealDevice(device, key, C.saltOf(env), C.iterationsOf(env));
    $('#pw').value = '';
    startSession({device, key, env, vault, sha, source, fetchedAt: source === 'remote' ? Date.now() : cached?.fetchedAt});
    if (source === 'pending') { S.dirty = true; publish().then(ok => ok && toast('השינויים שחיכו פורסמו')); }
    else if (syncErr) toast(SYNC_MSG[syncErr.code] + '. מוצג עותק שמור');
  } catch (e) {
    err.textContent = messageOf(e);
    $('#reconnect').hidden = !(e.kind === 'wrong' || e.kind === 'changed' || e.code === 'bad-token' || e.code === 'not-found');
  } finally {
    b.disabled = false;
    b.textContent = 'פתיחה';
  }
}

function startSession({device, key, env, vault, sha, source, fetchedAt}) {
  S = {device, key, salt: C.saltOf(env), iterations: C.iterationsOf(env), vault, sha, source, fetchedAt, dirty: false};
  ui.tab = 'overview';
  ui.kid = null;
  showGate(null);
  renderStatus();
  show('overview');
  bumpIdle();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function lock() {
  if (!S) return;
  S = null;
  clearTimeout(idleT);
  $$('.view').forEach(v => { v.innerHTML = ''; });
  $('#pw').value = '';
  showLock();
}

/* ---------- publishing (owner devices) ---------- */
async function pushEnv(env) {
  try {
    return await GH.writeVault(S.device, env, S.sha);
  } catch (e) {
    if (e.code !== 'conflict') throw e;
    const cur = await GH.readVault(S.device);       // single writer: take the latest sha and write again
    return GH.writeVault(S.device, env, cur?.sha);
  }
}

async function publish() {
  if (!isOwner()) return false;
  S.vault.updatedAt = new Date().toISOString();
  const env = await C.seal(S.vault, S.key, S.salt, 'vault', S.iterations);
  await Store.set('vault', {env, sha: S.sha, baseSha: S.sha, pending: true, fetchedAt: S.fetchedAt});
  try {
    S.sha = await pushEnv(env);
    S.dirty = false;
    S.source = 'remote';
    S.fetchedAt = Date.now();
    await Store.set('vault', {env, sha: S.sha, fetchedAt: S.fetchedAt});
    renderStatus();
    renderFloat();
    return true;
  } catch (e) {
    S.dirty = true;
    renderFloat();
    toast(messageOf(e) + '. השינויים נשמרו במכשיר ויפורסמו בהמשך');
    return false;
  }
}

async function refresh() {
  try {
    const remote = await GH.readVault(S.device);
    if (!remote) { toast('לא נמצא קובץ נתונים במאגר'); return; }
    if (!C.sameSalt(remote.env, {kdf: {salt: C.toB64(S.salt), iterations: S.iterations}})) {
      toast('הסיסמה שונתה במכשיר אחר. נועלים ופותחים מחדש עם הסיסמה החדשה');
      return;
    }
    S.vault = await C.unseal(remote.env, S.key, 'vault');
    S.sha = remote.sha; S.source = 'remote'; S.fetchedAt = Date.now(); S.dirty = false;
    await Store.set('vault', {env: remote.env, sha: remote.sha, fetchedAt: S.fetchedAt});
    renderStatus();
    show(ui.tab);
    toast('עודכן מהשרת');
  } catch (e) {
    toast(messageOf(e));
  }
}

/* ---------- shell ---------- */
function renderStatus() {
  const last = M.lastDate(S.vault);
  let s = isOwner() ? '' : 'צפייה בלבד. ';
  s += last ? `נתונים עד ${dstr(last)}` : 'עוד אין נתונים';
  if (S.source === 'cache') s += '. עותק שמור, בלי חיבור';
  $('#status').textContent = s;
  $('[data-tab="update"]').hidden = !isOwner();
}

function show(tab) {
  if (!S) return;
  if (tab === 'update' && !isOwner()) tab = 'overview';
  ui.tab = tab;
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  $$('.view').forEach(v => { v.hidden = v.id !== 'v-' + tab; });
  ({overview: renderOverview, accounts: renderAccounts, kids: renderKids, fees: renderFees, update: renderEdit})[tab]();
  renderFloat();
  window.scrollTo(0, 0);
}

function renderFloat() {
  const el = $('#float');
  if (!S || !(ui.tab === 'overview' || ui.tab === 'update')) { el.hidden = true; return; }
  if (S.dirty && isOwner()) {
    el.className = 'float warn';
    el.innerHTML = `<div class="fl-main"><span class="ic" aria-hidden="true">${I.bang}</span><span class="tx"><b>יש שינויים שלא פורסמו</b><small>הם שמורים רק במכשיר הזה</small></span></div><button class="act" type="button" data-act="publish">פרסום</button>`;
    el.hidden = false;
    return;
  }
  if (ui.tab !== 'overview' || !S.vault.accounts.length) { el.hidden = true; return; }
  const t = today();
  const stale = S.vault.accounts.filter(a => M.isStale(S.vault, a, t));
  const last = M.lastDate(S.vault);
  if (stale.length) {
    const never = stale.some(a => !M.latest(S.vault, a));
    el.className = 'float warn';
    el.innerHTML = `<button class="fl-main" type="button" data-act="status"><span class="ic" aria-hidden="true">${I.bang}</span><span class="tx"><b>${stale.length === 1 ? 'חשבון אחד לא עודכן' : stale.length + ' חשבונות לא עודכנו'}</b><small>${never ? 'יש חשבונות שעוד לא הוזנו' : `עברו יותר מ-${M.STALE_DAYS} יום`}</small></span>${isOwner() ? '' : I.chev}</button>${isOwner() ? '<button class="act" type="button" data-act="go-edit">לעריכה</button>' : ''}`;
  } else {
    const ago = M.days(last, t), agoTxt = ago <= 0 ? 'היום' : ago === 1 ? 'אתמול' : `לפני ${ago} ימים`;
    el.className = 'float ok';
    el.innerHTML = `<button class="fl-main" type="button" data-act="status"><span class="ic" aria-hidden="true">${I.check}</span><span class="tx"><b>הכל מעודכן</b><small>עדכון אחרון ${agoTxt}, ב-${last.getDate()} ב${MON_FULL[last.getMonth()]}</small></span>${I.chev}</button>`;
  }
  el.hidden = false;
}

/* ---------- overview ---------- */
function renderOverview() {
  const v = S.vault, t0 = today(), t = M.totals(v, M.FAR, t0), series = M.netSeries(v, t0);
  const last = M.lastDate(v);
  if (!t.count) {
    $('#v-overview').innerHTML = `${cardHtml(null, null)}
      <div class="empty"><h3>עוד אין יתרות</h3>
        <p>${isOwner() ? 'מזינים את היתרות הראשונות בעמוד העריכה, והסקירה תתמלא.' : 'כשיפורסמו יתרות מהמכשיר הראשי, הן יופיעו כאן.'}</p>
        ${isOwner() ? '<button class="btn" type="button" data-act="go-edit">להזנת יתרות</button>' : ''}</div>`;
    bindCard();
    return;
  }
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const d = prev ? t.net - prev.v : null;
  const yearD = series.length > 1 ? t.net - series[0].v : null;

  const groups = {now: [], later: [], pension: [], property: []};
  for (const a of v.accounts) {
    if (TYPES[a.type].liq === 'liability' || !M.latest(v, a)) continue;
    groups[M.liqOf(a, t0)].push(a);
  }
  const laterDates = groups.later.map(a => a.liqDate).filter(Boolean).sort();
  const laterWhen = laterDates.length ? (() => { const x = M.parseDay(laterDates[0]); return `${MON_FULL[x.getMonth()]} ${x.getFullYear()}`; })() : 'בהמשך';
  const uniq = arr => [...new Set(arr)].join(', ');
  const stops = [
    {k: 'now', when: 'היום', what: uniq(groups.now.map(a => TYPES[a.type].label))},
    {k: 'later', when: laterWhen, what: groups.later.map(typedTitle).join(', ')},
    {k: 'pension', when: 'בפרישה', what: groups.pension.map(typedTitle).join(', ')},
  ].filter(s => t.liq[s.k]);
  let cum = 0;

  $('#v-overview').innerHTML = `
    <section class="cc-hero" aria-label="השווי הנקי של המשפחה">
      ${cardHtml(t.net, last)}
      <div class="strip">
        <div><span class="k">${prev ? 'מסוף ' + MON_FULL[prev.d.getMonth()] : 'שינוי חודשי'}</span>${d === null ? '<b>—</b>' : `<b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? I.up : I.down}${signed(d)} ₪</b>`}</div>
        <div><span class="k">כל הנכסים</span><b class="amt">${money(t.assets)}</b></div>
        <div><span class="k">יתרת משכנתא</span><b class="amt">${money(t.liab)}</b></div>
      </div>
    </section>

    ${series.length > 1 ? `<section class="sec">
      <div class="sec-h"><h2>${series.length >= 12 ? 'השנה האחרונה' : 'מאז ' + MON_FULL[series[0].d.getMonth()]}</h2><span class="aside">${yearD >= 0 ? 'עלייה' : 'ירידה'} של <span class="amt">${money(Math.abs(yearD))}</span></span></div>
      <div class="chart-wrap" id="netChart"></div>
    </section>` : ''}

    <section class="sec">
      <div class="sec-h"><h2>מתי אפשר להשתמש בכסף</h2></div>
      <ol class="tl">
        ${stops.map(s => { cum += t.liq[s.k]; return `
          <li style="--c:${LIQ[s.k].c}">
            <div class="row1"><span class="when">${esc(s.when)}</span><span class="cum">${s.k === 'now' ? '' : `בסך הכל עד אז <span class="amt">${money(cum)}</span>`}</span></div>
            <div class="v amt">${money(t.liq[s.k])}</div>
            <div class="what">${esc(s.what)}</div>
            <div class="track"><span style="width:${(t.liq[s.k] / t.assets * 100).toFixed(1)}%"></span></div>
          </li>`; }).join('')}
        ${t.liq.property ? `
          <li class="prop" style="--c:${LIQ.property.c}">
            <div class="row1"><span class="when">נדל״ן</span><span class="cum">שווי משוער, לא נזיל</span></div>
            <div class="v amt">${money(t.liq.property)}</div>
            <div class="what">${esc(groups.property.map(titleOf).join(', '))}</div>
            <div class="track"><span style="width:${(t.liq.property / t.assets * 100).toFixed(1)}%"></span></div>
          </li>` : ''}
      </ol>
    </section>

    <div class="foot">${I.lock}<span>מוצפן על המכשיר. בלי הסיסמה אי אפשר לקרוא את הנתונים.</span></div>`;
  if (series.length > 1) lineChart($('#netChart'), series);
  bindCard();
}

function cardHtml(net, last) {
  return `<div class="cc metal" id="card">
    <span class="sheen" aria-hidden="true"></span>
    <div class="r1"><span class="brand"><svg class="mk" viewBox="0 0 200 200" aria-hidden="true">${MARK}</svg>הכסף שלנו</span>${CONTACTLESS}</div>
    ${CHIP}
    <div><div class="lb">שווי נקי</div><div class="fc">${net === null ? '<span>—</span>' : `<span class="amt">${NUM.format(Math.round(net))}</span><small>₪</small>`}</div></div>
    <div class="r3"><span>${esc(members()[0]?.name === 'הורים' ? 'המשפחה שלנו' : members()[0]?.name || 'המשפחה שלנו')}</span><span>${last ? `עדכון ${String(last.getMonth() + 1).padStart(2, '0')}/${String(last.getFullYear()).slice(2)}` : 'עוד אין עדכון'}</span></div>
  </div>`;
}

function bindCard() {
  const c = $('#card');
  if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const set = (k, val) => c.style.setProperty(k, val);
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.classList.add('live');
    set('--ry', ((x - .5) * 10).toFixed(2) + 'deg'); set('--rx', ((.5 - y) * 8).toFixed(2) + 'deg');
    set('--mx', (x * 100).toFixed(1) + '%'); set('--my', (y * 100).toFixed(1) + '%'); set('--so', '.75');
  });
  const reset = () => { c.classList.remove('live'); set('--rx', '0deg'); set('--ry', '0deg'); set('--so', '.35'); };
  ['pointerleave', 'pointerup', 'pointercancel'].forEach(ev => c.addEventListener(ev, reset));
}

/* ---------- accounts ---------- */
function renderAccounts() {
  const v = S.vault, t0 = today();
  if (!v.accounts.length) {
    $('#v-accounts').innerHTML = `<div class="sec-h top-gap"><h2>כל החשבונות</h2></div><div class="empty"><p>עוד אין חשבונות. ${isOwner() ? 'מוסיפים אותם בעריכה, בלשונית "משפחה וחשבונות".' : ''}</p></div>`;
    return;
  }
  const inst = new Set(v.accounts.map(a => a.inst).filter(Boolean)).size;
  let h = `<div class="sec-h top-gap"><h2>כל החשבונות</h2><span class="aside">${v.accounts.length} חשבונות${inst ? ` ב-${inst} גופים` : ''}</span></div>`;
  for (const k of TYPE_ORDER) {
    const list = v.accounts.filter(a => a.type === k);
    if (!list.length) continue;
    const sum = list.reduce((s, a) => s + (M.latest(v, a)?.value || 0), 0);
    h += `<div class="grp"><div class="grp-h"><span>${TYPES[k].group}</span><span class="amt">${money(k === 'mortgage' ? -sum : sum)}</span></div><div class="list">`;
    h += list.map(a => {
      const e = M.latest(v, a), st = M.staleDays(v, a, t0);
      const meta = !e ? '<span class="stale">' + I.warn + 'עוד לא הוזן</span>'
        : st > M.staleLimit(a) ? `<span class="stale">${I.warn}לפני ${st} ימים</span>` : `<span class="u">${dstr(e.date)}</span>`;
      return `<button class="row" type="button" data-act="acc" data-id="${a.id}">
        <span class="mono" aria-hidden="true">${esc(monoOf(a))}</span>
        <span class="mid"><span class="t">${esc(titleOf(a))}</span><span class="s">${esc(subOf(a))}</span></span>
        <span class="end"><span class="b amt">${e ? money(TYPES[a.type].liq === 'liability' ? -e.value : e.value) : '—'}</span>${meta}</span>
      </button>`;
    }).join('');
    h += '</div></div>';
  }
  $('#v-accounts').innerHTML = h + '<div class="foot">לוחצים על חשבון כדי לראות היסטוריה ואיפה למצוא את היתרה</div>';
}

function accountSheet(id) {
  const v = S.vault, a = v.accounts.find(x => x.id === id);
  if (!a) return;
  const e = M.latest(v, a), ser = M.seriesFor(v, [a], today());
  const hist = [...M.entries(v, a.id)].reverse().slice(0, 6);
  const liqTxt = TYPES[a.type].liq === 'liability' ? 'התחייבות' : a.type === 'realestate' ? 'לא נזיל' : a.type === 'pension' ? 'בפרישה'
    : M.liqOf(a, today()) === 'now' ? 'זמין עכשיו' : a.liqDate ? `מ${MON_FULL[M.parseDay(a.liqDate).getMonth()]} ${M.parseDay(a.liqDate).getFullYear()}` : 'בהמשך';
  openSheet(`
    <div class="sh-head"><span class="mono">${esc(monoOf(a))}</span><div class="mid"><h3>${esc(titleOf(a))}</h3><div class="s">${esc(subOf(a))}</div></div>
      <button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
    <p class="sh-fig amt">${e ? money(TYPES[a.type].liq === 'liability' ? -e.value : e.value) : '—'}</p>
    <p class="sh-sub">${e ? 'עודכן ב-' + dstr(e.date) : 'עוד לא הוזנה יתרה'}</p>
    ${ser.length > 1 ? '<div class="chart-wrap" id="accChart"></div>' : ''}
    <dl class="kv"><dt>זמינות</dt><dd>${liqTxt}</dd>
      ${a.fee != null ? `<dt>דמי ניהול מהצבירה</dt><dd>${feeStr(a.fee)}</dd>${e ? `<dt>עלות שנתית משוערת</dt><dd class="amt">${money(e.value * a.fee / 100)}</dd>` : ''}` : ''}
      ${a.dep != null ? `<dt>הפקדה חודשית</dt><dd class="amt">${money(a.dep)}</dd>` : ''}</dl>
    ${a.where ? `<div class="where"><b>איפה רואים את היתרה:</b> ${esc(a.where)}</div>` : ''}
    ${hist.length ? `<div class="hist"><h4>עדכונים אחרונים</h4>${hist.map((x, i) => {
      const nx = hist[i + 1], dd = nx ? x.value - nx.value : null;
      return `<div class="hrow"><span>${dstr(x.date)}</span><span class="amt">${money(x.value)}</span><span class="d">${dd === null ? '' : signed(dd)}</span></div>`;
    }).join('')}</div>` : ''}
    ${isOwner() ? `<button class="btn ghost" type="button" data-act="edit-account" data-id="${a.id}">עריכת פרטי החשבון</button>` : ''}`);
  if (ser.length > 1) requestAnimationFrame(() => lineChart($('#accChart'), ser, {height: 130, label: titleOf(a)}));
}

/* ---------- kids ---------- */
function renderKids() {
  const v = S.vault, t0 = today(), list = kids();
  if (!list.length) {
    $('#v-kids').innerHTML = `<div class="sec-h top-gap"><h2>הילדים</h2></div><div class="empty"><p>עוד אין ילדים ברשימה. ${isOwner() ? 'מוסיפים אותם בעריכה, בלשונית "משפחה וחשבונות".' : ''}</p></div>`;
    return;
  }
  const info = list.map(k => {
    const accs = v.accounts.filter(a => a.owner === k.id && TYPES[a.type].liq !== 'liability');
    const ser = M.seriesFor(v, accs, t0);
    const total = accs.reduce((s, a) => s + (M.latest(v, a)?.value || 0), 0);
    return {k, accs, ser, total, growth: ser.length > 1 ? total - ser[0].v : null};
  });
  const sel = info.find(x => x.k.id === ui.kid);
  const growthLabel = x => x.ser.length >= 12 ? 'בשנה' : x.ser.length > 1 ? 'מאז ' + MON_FULL[x.ser[0].d.getMonth()] : '';
  $('#v-kids').innerHTML = `
    <div class="sec-h top-gap"><h2>החיסכון של הילדים</h2><span class="aside amt">${money(info.reduce((s, x) => s + x.total, 0))}</span></div>
    <p class="lede">לוחצים על ילד כדי לראות גרף ופרטים.</p>
    <div class="ktiles">
      ${info.map(x => `
        <button class="ktile" type="button" data-act="kid" data-id="${x.k.id}" aria-expanded="${x === sel}">
          ${kidIcon(x.k)}
          <span class="n">${esc(x.k.name)}</span>
          <span class="v amt">${money(x.total)}</span>
          <span class="d">${x.growth === null ? '&nbsp;' : `${signed(x.growth)} ${growthLabel(x)}`}</span>
        </button>`).join('')}
    </div>
    ${sel ? `
      <section class="kdetail" aria-label="${esc(sel.k.name)}">
        <div class="kc-h">${kidIcon(sel.k)}<div class="mid"><h3>${esc(sel.k.name)}</h3><span class="s">${esc(sel.accs.map(typedTitle).join(', ') || 'אין חשבונות')}</span></div>
          <span class="kc-v amt">${money(sel.total)}</span></div>
        ${sel.ser.length > 1 ? '<div class="chart-wrap" id="kidChart"></div>' : '<p class="hint">הגרף יופיע אחרי שיהיו נתונים מחודשיים שונים.</p>'}
        <dl class="kc-stats">
          <div><dt>${sel.growth === null ? 'גידול' : 'גדל ' + growthLabel(sel)}</dt><dd>${sel.growth === null ? '—' : signed(sel.growth) + ' ₪'}</dd></div>
          <div><dt>הפקדה חודשית</dt><dd class="amt">${sel.accs.some(a => a.dep != null) ? money(sel.accs.reduce((s, a) => s + (a.dep || 0), 0)) : '—'}</dd></div>
          <div><dt>דמי ניהול</dt><dd>${sel.accs.length === 1 ? feeStr(sel.accs[0].fee) : '—'}</dd></div>
        </dl>
      </section>` : ''}`;
  if (sel && sel.ser.length > 1) lineChart($('#kidChart'), sel.ser, {height: 130, label: sel.k.name});
}

/* ---------- fees ---------- */
function renderFees() {
  const v = S.vault;
  const rows = v.accounts.filter(a => a.fee != null && M.latest(v, a)).map(a => ({a, y: M.latest(v, a).value * a.fee / 100})).sort((x, y) => y.a.fee - x.a.fee);
  if (!rows.length) {
    $('#v-fees').innerHTML = `<div class="sec-h top-gap"><h2>דמי ניהול</h2></div><div class="empty"><p>עוד לא הוזנו דמי ניהול. ${isOwner() ? 'מזינים אותם בעריכה, בפרטי כל חשבון.' : ''}</p></div>`;
    return;
  }
  const total = rows.reduce((s, r) => s + r.y, 0), maxY = Math.max(...rows.map(r => r.y));
  $('#v-fees').innerHTML = `
    <div class="sec-h top-gap"><h2>דמי ניהול</h2></div>
    <section class="fee-sum">
      <p class="eyebrow">עלות משוערת בשנה</p>
      <p class="big amt">${money(total)}</p>
      <p class="s">לפי אחוז דמי הניהול מהצבירה בכל חשבון. לא כולל דמי ניהול מהפקדה.</p>
    </section>
    <div class="sec-h" style="margin-top:24px"><h2>לפי חשבון</h2><span class="aside">מהאחוז הגבוה לנמוך</span></div>
    <div class="fees">
      ${rows.map(({a, y}) => `
        <div class="fee2">
          <div class="top"><span>${esc(titleOf(a))}<small>${esc(subOf(a))}</small></span><span class="r">${feeStr(a.fee)}</span></div>
          <div class="bar1"><span style="width:${(y / maxY * 100).toFixed(1)}%"></span></div>
          <div class="y"><span class="amt">${money(y)}</span> בשנה</div>
        </div>`).join('')}
    </div>`;
}

/* ---------- edit (owner only) ---------- */
function renderEdit() {
  const head = `<div class="sec-h top-gap"><h2>עריכה</h2></div>
    <div class="seg-ctl" role="group" aria-label="מה עורכים">
      <button type="button" data-act="edit-mode" data-mode="balances" aria-pressed="${ui.editMode === 'balances'}">יתרות</button>
      <button type="button" data-act="edit-mode" data-mode="manage" aria-pressed="${ui.editMode === 'manage'}">משפחה וחשבונות</button>
    </div>`;
  $('#v-update').innerHTML = head + (ui.editMode === 'balances' ? balancesHtml() : manageHtml());
}

function balancesHtml() {
  const v = S.vault, t0 = today();
  if (!v.accounts.length) return `<div class="empty"><p>עוד אין חשבונות. מוסיפים אותם בלשונית "משפחה וחשבונות".</p></div>`;
  const sorted = [...v.accounts].sort((a, b) => (M.staleDays(v, b, t0) ?? 1e9) - (M.staleDays(v, a, t0) ?? 1e9));
  return `
    <p class="lede" style="margin-top:14px">מעתיקים את היתרות מהאתרים. חשבון שלא ממלאים נשאר עם הערך האחרון שלו.</p>
    <label class="field">תאריך העדכון<input class="in" type="date" id="updDate" value="${isoDay(t0)}"></label>
    <div class="count" id="count">עודכנו 0 מתוך ${v.accounts.length}</div>
    <div class="list">
      ${sorted.map(a => {
        const e = M.latest(v, a), st = M.staleDays(v, a, t0);
        const hint = a.type === 'mortgage' ? 'יתרה לסילוק' : a.type === 'realestate' ? 'שווי משוער' : '';
        return `<div class="urow">
          <div class="t">${esc(titleOf(a))}</div>
          <div class="s"><span>${esc(subOf(a))}${hint ? ', ' + hint : ''}</span>${!e ? `<span class="stale">${I.warn}עוד לא הוזן</span>` : st > M.staleLimit(a) ? `<span class="stale">${I.warn}לפני ${st} ימים</span>` : ''}</div>
          <input class="in num" inputmode="numeric" data-upd="${a.id}" placeholder="${e ? NUM.format(e.value) : 'סכום בש״ח'}" aria-label="יתרה חדשה: ${esc(titleOf(a))}, ${esc(subOf(a))}">
        </div>`;
      }).join('')}
    </div>
    <button class="btn" id="saveBalances" type="button" data-act="save-balances" disabled>שמירה ופרסום</button>`;
}

function manageHtml() {
  const v = S.vault, groups = TYPE_ORDER.map(k => [k, v.accounts.filter(a => a.type === k)]).filter(([, l]) => l.length);
  return `
    <div class="mgr-h"><h3>בני המשפחה</h3></div>
    <div class="list">
      ${members().map(m => `<button class="row" type="button" data-act="member" data-id="${m.id}">
        ${m.kind === 'child' ? kidIcon(m) : '<span class="mono" aria-hidden="true">' + esc(m.name.charAt(0)) + '</span>'}
        <span class="mid"><span class="t">${esc(m.name)}</span><span class="s">${m.kind === 'child' ? (m.gender === 'f' ? 'בת' : 'בן') : 'החשבונות המשותפים'}</span></span>${I.chev}</button>`).join('')}
    </div>
    <button class="add" type="button" data-act="add-kid">הוספת ילד</button>

    <div class="mgr-h"><h3>חשבונות ונכסים</h3></div>
    ${groups.map(([k, list]) => `<div class="grp-h">${TYPES[k].group}</div><div class="list" style="margin-bottom:12px">
      ${list.map(a => `<button class="row" type="button" data-act="edit-account" data-id="${a.id}">
        <span class="mono" aria-hidden="true">${esc(monoOf(a))}</span>
        <span class="mid"><span class="t">${esc(titleOf(a))}</span><span class="s">${esc(subOf(a))}</span></span>${I.chev}</button>`).join('')}
    </div>`).join('')}
    <button class="add" type="button" data-act="add-account">הוספת חשבון</button>
    <button class="add" type="button" data-act="add-property">הוספת נכס נדל״ן</button>
    <p class="hint" style="margin-top:14px">שינויים כאן נשמרים במכשיר ומתפרסמים בלחיצה על "פרסום".</p>`;
}

function saveBalances() {
  const day = $('#updDate').value;
  if (!M.validDay(day)) { toast('תאריך לא תקין'); return; }
  let n = 0, bad = 0;
  $$('[data-upd]').forEach(inp => {
    const raw = inp.value.trim();
    if (!raw) return;
    const val = Number(raw.replace(/[,\s₪]/g, ''));
    if (!isFinite(val) || val < 0) { bad++; inp.classList.add('invalid'); return; }
    M.setEntry(S.vault, inp.dataset.upd, day, Math.round(val));
    n++;
  });
  if (bad) { toast('יש סכום לא תקין. מתקנים ושומרים שוב'); return; }
  if (!n) return;
  S.dirty = true;
  publish().then(ok => {
    renderStatus();
    if (ok) toast(n === 1 ? 'פורסם: חשבון אחד עודכן' : `פורסם: ${n} חשבונות עודכנו`);
    show('overview');
  });
}

const FIELD_RULES = {
  inst: t => t !== 'realestate',
  fee: t => ['trading', 'gemel', 'hishtalmut', 'pension'].includes(t),
  dep: t => ['gemel', 'hishtalmut', 'pension'].includes(t),
  liq: t => t === 'hishtalmut',
  inactive: t => ['gemel', 'hishtalmut', 'pension'].includes(t),
};
function applyTypeFields(form) {
  const t = form.elements.type.value;
  $$('[data-f]', form).forEach(el => { el.hidden = !(FIELD_RULES[el.dataset.f] || (() => true))(t); });
  $('[data-f-label="name"]', form).firstChild.textContent = t === 'realestate' ? 'שם הנכס' : 'שם לתצוגה (לא חובה)';
}

function accountEditSheet(id, preset) {
  const a = id ? S.vault.accounts.find(x => x.id === id) : null;
  const type = a?.type || preset || 'checking';
  openSheet(`
    <form id="accForm" data-id="${a ? a.id : ''}" autocomplete="off">
      <div class="sh-head"><div class="mid"><h3>${a ? 'עריכת ' + esc(titleOf(a)) : type === 'realestate' ? 'נכס נדל״ן חדש' : 'חשבון חדש'}</h3></div>
        <button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
      <label class="field">סוג<select class="in" name="type">${TYPE_ORDER.map(k => `<option value="${k}" ${k === type ? 'selected' : ''}>${TYPES[k].label}</option>`).join('')}</select></label>
      <label class="field" data-f-label="name">שם לתצוגה (לא חובה)<input class="in" name="name" value="${esc(a?.name || '')}" maxlength="60"></label>
      <label class="field" data-f="inst">גוף מנהל<input class="in" name="inst" value="${esc(a?.inst || '')}" maxlength="60" placeholder="למשל: בנק, בית השקעות או חברת ביטוח"></label>
      <label class="field">שייך ל<select class="in" name="owner">${members().map(m => `<option value="${m.id}" ${m.id === (a?.owner || 'family') ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field" data-f="fee">דמי ניהול מהצבירה, באחוזים<input class="in num" name="fee" inputmode="decimal" value="${a?.fee ?? ''}" placeholder="0.65"></label>
      <label class="field" data-f="dep">הפקדה חודשית בש״ח<input class="in num" name="dep" inputmode="numeric" value="${a?.dep ?? ''}"></label>
      <label class="field" data-f="liq">נזילה מתאריך<input class="in" type="date" name="liqDate" value="${a?.liqDate || ''}"></label>
      <label class="check" data-f="inactive"><input type="checkbox" name="inactive" ${a?.inactive ? 'checked' : ''}>חשבון לא פעיל</label>
      <label class="field">איפה רואים את היתרה (לא חובה)<input class="in" name="where" value="${esc(a?.where || '')}" maxlength="200"></label>
      <p class="err" id="accErr" role="alert"></p>
      <button class="btn" type="submit">שמירה</button>
      ${a ? `<button class="btn danger" type="button" data-act="delete-account" data-id="${a.id}">מחיקת החשבון</button>` : ''}
    </form>`);
  applyTypeFields($('#accForm'));
}

function onAccountSave(form) {
  const f = form.elements, t = f.type.value;
  const num = (x, max) => { const s = x.trim().replace(/[,\s%₪]/g, ''); if (!s) return null; const n = Number(s); return isFinite(n) && n >= 0 && n <= max ? n : NaN; };
  const fee = FIELD_RULES.fee(t) ? num(f.fee.value, 5) : null;
  const dep = FIELD_RULES.dep(t) ? num(f.dep.value, 1e6) : null;
  if (Number.isNaN(fee)) { $('#accErr').textContent = 'דמי ניהול צריכים להיות מספר בין 0 ל-5, למשל 0.65.'; return; }
  if (Number.isNaN(dep)) { $('#accErr').textContent = 'ההפקדה החודשית צריכה להיות מספר.'; return; }
  if (t === 'realestate' && !f.name.value.trim()) { $('#accErr').textContent = 'צריך לתת לנכס שם, למשל "דירת מגורים".'; return; }
  const ids = new Set(members().map(m => m.id));
  const data = M.normAccount({
    id: form.dataset.id || undefined, type: t, name: f.name.value, inst: FIELD_RULES.inst(t) ? f.inst.value : '',
    owner: f.owner.value, fee, dep, liqDate: FIELD_RULES.liq(t) ? f.liqDate.value : null,
    inactive: FIELD_RULES.inactive(t) && f.inactive.checked, where: f.where.value,
  }, ids);
  const i = S.vault.accounts.findIndex(x => x.id === data.id);
  if (i >= 0) S.vault.accounts[i] = data; else S.vault.accounts.push(data);
  S.dirty = true;
  closeSheet();
  show('update');
}

function memberSheet(id) {
  const m = id ? members().find(x => x.id === id) : null;
  const isKid = !m || m.kind === 'child';
  const hasAccounts = m && S.vault.accounts.some(a => a.owner === m.id);
  openSheet(`
    <form id="memberForm" data-id="${m ? m.id : ''}" autocomplete="off">
      <div class="sh-head"><div class="mid"><h3>${m ? esc(m.name) : 'ילד חדש'}</h3></div>
        <button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
      <label class="field">שם<input class="in" name="name" value="${esc(m?.name || '')}" maxlength="40" required></label>
      ${isKid ? `<div class="field">בן או בת
        <div class="seg-ctl" role="group" aria-label="בן או בת">
          <button type="button" data-act="pick" data-gender="m" aria-pressed="${(m?.gender || 'm') === 'm'}">בן</button>
          <button type="button" data-act="pick" data-gender="f" aria-pressed="${m?.gender === 'f'}">בת</button>
        </div></div>` : '<p class="hint">השם שמופיע ליד החשבונות המשותפים.</p>'}
      <p class="err" id="memErr" role="alert"></p>
      <button class="btn" type="submit">שמירה</button>
      ${m && isKid ? `<button class="btn danger" type="button" data-act="delete-member" data-id="${m.id}" ${hasAccounts ? 'disabled' : ''}>הסרה מהרשימה</button>
        ${hasAccounts ? '<p class="hint">אי אפשר להסיר ילד שיש לו חשבונות. קודם מעבירים או מוחקים את החשבונות.</p>' : ''}` : ''}
    </form>`);
}

function onMemberSave(form) {
  const name = form.elements.name.value.trim().slice(0, 40);
  if (!name) { $('#memErr').textContent = 'צריך שם.'; return; }
  const g = $('[data-gender][aria-pressed="true"]', form)?.dataset.gender;
  const id = form.dataset.id;
  if (id) {
    const m = members().find(x => x.id === id);
    m.name = name;
    if (m.kind === 'child') m.gender = g === 'f' ? 'f' : 'm';
  } else {
    S.vault.members.push({id: M.uid(), name, kind: 'child', gender: g === 'f' ? 'f' : 'm'});
  }
  S.dirty = true;
  closeSheet();
  show('update');
}

/* ---------- settings, pairing, password ---------- */
function settingsSheet() {
  const owner = isOwner();
  openSheet(`
    <div class="sh-head"><div class="mid"><h3>הגדרות</h3></div><button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
    <div class="set">
      <h4>המכשיר הזה</h4>
      <div class="line"><span>תפקיד</span><span>${owner ? 'מעדכן ומפרסם' : 'צפייה בלבד'}</span></div>
      <div class="line"><span>מאגר הנתונים</span><span dir="ltr">${esc(S.device.repo)}</span></div>
    </div>
    <div class="set">
      <h4>סנכרון</h4>
      <div class="line"><span>פורסם לאחרונה</span><span>${S.vault.updatedAt ? dstr(new Date(S.vault.updatedAt)) : '—'}</span></div>
      <div class="line"><span>ירד למכשיר</span><span>${S.fetchedAt ? dstr(new Date(S.fetchedAt)) : '—'}</span></div>
      <button class="btn ghost" type="button" data-act="refresh">רענון מהשרת</button>
    </div>
    ${owner ? `<div class="set">
      <h4>חיבור טלפון</h4>
      <p>יוצרים קישור צירוף, שולחים אותו לטלפון ומזינים שם את הסיסמה המשפחתית. הקישור מוצפן, ובלי הסיסמה אי אפשר להשתמש בו.</p>
      <button class="btn ghost" type="button" data-act="pair-me">קישור לטלפון שלי</button>
      <button class="btn ghost" type="button" data-act="pair-viewer">קישור לטלפון לצפייה בלבד</button>
    </div>
    <div class="set">
      <h4>סיסמה</h4>
      <p>אחרי החלפת סיסמה, צריך לחבר מחדש את שאר הטלפונים עם קישור צירוף חדש.</p>
      <button class="btn ghost" type="button" data-act="change-pw">החלפת הסיסמה המשפחתית</button>
    </div>` : ''}
    <div class="set">
      <h4>גיבוי ונעילה</h4>
      <button class="btn ghost" type="button" data-act="backup">הורדת גיבוי מוצפן</button>
      <button class="btn ghost" type="button" data-act="lock-now">נעילה עכשיו</button>
      <button class="btn danger" type="button" data-act="disconnect">ניתוק המכשיר</button>
    </div>`);
}

async function pairCodeFor(token, role) {
  const env = await C.seal({repo: S.device.repo, path: S.device.path, token, role}, S.key, S.salt, 'pair', S.iterations);
  return 'fm1.' + b64url(JSON.stringify(env));
}

function showPair(code, who) {
  const link = `${location.origin}${location.pathname}#pair=${code}`;
  ui.pairLink = link;
  openSheet(`
    <div class="sh-head"><div class="mid"><h3>קישור צירוף</h3><div class="s">${who}</div></div><button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
    <ol class="howto">
      <li>שולחים את הקישור לטלפון, למשל בהודעה לעצמכם.</li>
      <li>באייפון: פותחים את האתר בספארי, מוסיפים למסך הבית, ופותחים את האפליקציה מהמסך.</li>
      <li>בוחרים "חיבור לנתונים קיימים", מדביקים את הקישור ומזינים את הסיסמה המשפחתית.</li>
    </ol>
    <textarea class="in code" rows="4" dir="ltr" readonly aria-label="קישור הצירוף">${esc(link)}</textarea>
    <button class="btn" type="button" data-act="copy-pair">העתקת הקישור</button>
    ${navigator.share ? '<button class="btn ghost" type="button" data-act="share-pair">שיתוף</button>' : ''}`);
}

function viewerPairSheet() {
  openSheet(`
    <form id="pairForm" autocomplete="off">
      <div class="sh-head"><div class="mid"><h3>קישור לצפייה בלבד</h3></div><button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
      <p class="hint">מדביקים כאן טוקן נפרד עם הרשאת קריאה בלבד. כך הטלפון השני יכול לראות את הנתונים, אבל לא לשנות אותם. הטוקן לא נשמר במכשיר הזה.</p>
      <label class="field">טוקן לקריאה בלבד<input class="in" name="token" type="password" dir="ltr" placeholder="github_pat_…"></label>
      <p class="err" id="pairErr" role="alert"></p>
      <button class="btn" type="submit">יצירת קישור</button>
    </form>`);
}

async function onViewerPair(form) {
  const token = form.elements.token.value.trim();
  if (!/^(github_pat_|ghp_)\w{20,}$/.test(token)) { $('#pairErr').textContent = 'הטוקן צריך להתחיל ב-github_pat_.'; return; }
  busy(form, 'בודק את הטוקן');
  try {
    await GH.readVault({...S.device, token});
    showPair(await pairCodeFor(token, 'viewer'), 'לטלפון לצפייה בלבד');
  } catch (e) {
    $('#pairErr').textContent = messageOf(e);
    unbusy(form);
  }
}

function passwordSheet() {
  openSheet(`
    <form id="pwForm" autocomplete="off">
      <div class="sh-head"><div class="mid"><h3>החלפת הסיסמה המשפחתית</h3></div><button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
      <label class="field">סיסמה חדשה, לפחות 12 תווים<input class="in" id="np1" type="password" autocomplete="new-password"></label>
      <button class="linkbtn" type="button" data-act="suggest">הצעת סיסמה חזקה</button>
      <div class="suggest" id="suggestBox" hidden></div>
      <label class="field">שוב את הסיסמה החדשה<input class="in" id="np2" type="password" autocomplete="new-password"></label>
      <p class="err" id="pwErr" role="alert"></p>
      <button class="btn" type="submit">החלפה ופרסום</button>
    </form>`);
}

async function onPasswordChange(form) {
  const p1 = $('#np1').value, p2 = $('#np2').value, err = $('#pwErr');
  if (p1.length < 12) { err.textContent = 'הסיסמה צריכה להיות באורך 12 תווים לפחות.'; return; }
  if (p1 !== p2) { err.textContent = 'שתי הסיסמאות לא זהות.'; return; }
  busy(form, 'מצפין מחדש');
  try {
    const salt = C.newSalt(), key = await C.deriveKey(p1, salt);
    S.vault.updatedAt = new Date().toISOString();
    const env = await C.seal(S.vault, key, salt, 'vault');
    S.sha = await pushEnv(env);                          // only switch keys once GitHub has the new file
    S.key = key; S.salt = salt; S.iterations = C.ITERATIONS; S.dirty = false; S.fetchedAt = Date.now();
    await Store.set('vault', {env, sha: S.sha, fetchedAt: S.fetchedAt});
    await sealDevice(S.device, key, salt, C.ITERATIONS);
    closeSheet();
    toast('הסיסמה הוחלפה. בשאר הטלפונים מתחברים מחדש');
  } catch (e) {
    err.textContent = messageOf(e) + '. הסיסמה לא הוחלפה.';
    unbusy(form);
  }
}

async function backup() {
  const env = await C.seal(S.vault, S.key, S.salt, 'vault', S.iterations);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(env)], {type: 'application/json'}));
  a.download = `family-money-backup-${isoDay(today())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function statusSheet() {
  const v = S.vault, t0 = today();
  const list = [...v.accounts].sort((a, b) => (M.staleDays(v, b, t0) ?? 1e9) - (M.staleDays(v, a, t0) ?? 1e9));
  const anyStale = list.some(a => M.isStale(v, a, t0));
  openSheet(`
    <div class="sh-head"><div class="mid"><h3>מתי עודכן כל חשבון</h3><div class="s">חשבון שלא עודכן יותר מ-${M.STALE_DAYS} יום מסומן בצהוב. נדל״ן: אחרי שנה.</div></div>
      <button class="ibtn" type="button" data-act="close" aria-label="סגירה">${I.x}</button></div>
    <div class="list" style="margin-top:14px">
      ${list.map(a => {
        const e = M.latest(v, a), st = M.staleDays(v, a, t0);
        const right = !e ? `<span class="stale">${I.warn}עוד לא הוזן</span>` : st > M.staleLimit(a) ? `<span class="stale">${I.warn}לפני ${st} ימים</span>` : `<span class="u">${dstr(e.date)}</span>`;
        return `<div class="srow"><span class="mid"><span class="t">${esc(titleOf(a))}</span><span class="s">${esc(subOf(a))}</span></span>${right}</div>`;
      }).join('')}
    </div>
    ${isOwner() && anyStale ? '<button class="btn" type="button" data-act="go-edit">לעריכה</button>' : ''}`);
}

function showSuggestion() {
  const p = C.suggestPassword(), box = $('#suggestBox');
  box.hidden = false;
  box.textContent = p;
  ['#nPw', '#nPw2', '#np1', '#np2'].forEach(s => { const el = $(s); if (el) { el.value = p; el.type = 'text'; } });
}

/* ---------- events ---------- */
const ACT = {
  'go-welcome': () => showSetup('welcome'),
  'go-new': () => showSetup('new'),
  'go-join': () => showSetup('join'),
  suggest: showSuggestion,
  pick: btn => { $$('[data-act="pick"]', btn.parentElement).forEach(b => b.setAttribute('aria-pressed', b === btn)); },
  reconnect: async () => {
    if (!confirm('לנתק את המכשיר ולחבר אותו מחדש? הנתונים במאגר לא נמחקים.')) return;
    await Store.clear();
    showSetup('join');
  },
  privacy: () => setPrivacy(!document.body.classList.contains('private')),
  settings: settingsSheet,
  close: closeSheet,
  acc: b => accountSheet(b.dataset.id),
  kid: b => { ui.kid = ui.kid === b.dataset.id ? null : b.dataset.id; renderKids(); },
  status: statusSheet,
  'go-edit': () => { closeSheet(); ui.editMode = 'balances'; show('update'); },
  publish: () => publish().then(ok => { if (ok) { toast('פורסם'); show(ui.tab); } }),
  'edit-mode': b => { ui.editMode = b.dataset.mode; renderEdit(); },
  'save-balances': saveBalances,
  member: b => memberSheet(b.dataset.id),
  'add-kid': () => memberSheet(null),
  'edit-account': b => accountEditSheet(b.dataset.id),
  'add-account': () => accountEditSheet(null, 'checking'),
  'add-property': () => accountEditSheet(null, 'realestate'),
  'delete-account': b => {
    const a = S.vault.accounts.find(x => x.id === b.dataset.id);
    if (!a || !confirm(`למחוק את "${titleOf(a)}" ואת כל ההיסטוריה שלו? אחרי הפרסום אי אפשר לשחזר.`)) return;
    S.vault.accounts = S.vault.accounts.filter(x => x.id !== a.id);
    delete S.vault.entries[a.id];
    S.dirty = true;
    closeSheet();
    show('update');
  },
  'delete-member': b => {
    const m = members().find(x => x.id === b.dataset.id);
    if (!m || S.vault.accounts.some(a => a.owner === m.id) || !confirm(`להסיר את ${m.name} מהרשימה?`)) return;
    S.vault.members = members().filter(x => x.id !== m.id);
    S.dirty = true;
    closeSheet();
    show('update');
  },
  refresh: () => { closeSheet(); refresh(); },
  'pair-me': async () => showPair(await pairCodeFor(S.device.token, 'owner'), 'לטלפון של מי שמעדכן'),
  'pair-viewer': viewerPairSheet,
  'copy-pair': async () => { try { await navigator.clipboard.writeText(ui.pairLink); toast('הקישור הועתק'); } catch { toast('לא הצלחתי להעתיק. מסמנים את הטקסט ומעתיקים ידנית'); } },
  'share-pair': () => navigator.share({text: ui.pairLink}).catch(() => {}),
  'change-pw': passwordSheet,
  backup: () => backup().then(() => toast('הגיבוי המוצפן ירד')),
  'lock-now': lock,
  disconnect: async () => {
    if (!confirm('לנתק את המכשיר? הנתונים במאגר לא נמחקים, אבל כדי לחזור צריך קישור צירוף או טוקן.')) return;
    S = null;
    await Store.clear();
    showSetup('welcome');
  },
};
const FORMS = {
  joinForm: onJoin, newForm: onNew, accForm: onAccountSave, memberForm: onMemberSave,
  pwForm: onPasswordChange, pairForm: onViewerPair, lockForm: onUnlock,
};

document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { show(tab.dataset.tab); return; }
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && ACT[b.dataset.act]) { e.preventDefault(); ACT[b.dataset.act](b); }
});
document.addEventListener('submit', e => {
  const fn = FORMS[e.target.id];
  if (fn) { e.preventDefault(); fn(e.target); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'jCode') $('#jManual').hidden = parseJoinCode(e.target.value)?.kind !== 'token';
  if (e.target.matches('[data-upd]')) {
    e.target.classList.remove('invalid');
    const n = $$('[data-upd]').filter(i => i.value.trim()).length;
    $('#count').textContent = `עודכנו ${n} מתוך ${S.vault.accounts.length}`;
    $('#saveBalances').disabled = n === 0;
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'nFile') onStructureFile(e.target);
  if (e.target.name === 'type' && e.target.form?.id === 'accForm') applyTypeFields(e.target.form);
});
$('#scrim').addEventListener('click', closeSheet);

function setPrivacy(on) {
  document.body.classList.toggle('private', on);
  const b = $('#privBtn');
  b.innerHTML = on ? I.eyeOff : I.eye;
  b.setAttribute('aria-pressed', on);
  b.setAttribute('aria-label', on ? 'הצגת סכומים' : 'הסתרת סכומים');
}

/* auto-lock: after 5 idle minutes, or a minute in the background */
let idleT, hiddenAt = 0;
function bumpIdle() { clearTimeout(idleT); if (S) idleT = setTimeout(lock, LOCK_AFTER_MS); }
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, bumpIdle, {passive: true}));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (S && Date.now() - hiddenAt > HIDDEN_LOCK_MS) lock();
});

let rz;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (S && ui.tab === 'overview') renderOverview(); }, 200);
});

// A pairing link opened while the app is already showing (same page, new #pair=…).
addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#pair=')) return;
  const code = location.hash.slice(6);
  history.replaceState(null, '', location.pathname + location.search);
  if (S) { toast('קישור צירוף פותחים בטלפון שמחברים, לא במכשיר שכבר מחובר'); return; }
  showSetup('join', {code: code.startsWith('fm1.') ? code : ''});
});

/* ---------- boot ---------- */
async function boot() {
  $('#mark').innerHTML = MARK;
  $('#lockRos').outerHTML = GATE_ROS;
  setPrivacy(false);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  let code = null;
  if (location.hash.startsWith('#pair=')) {
    code = location.hash.slice(6);
    history.replaceState(null, '', location.pathname + location.search);   // keep the code out of history
  }
  let device = null;
  try { device = await Store.get('device'); } catch { /* storage blocked: treat as a new device */ }
  if (code) showSetup('join', {code: 'fm1.' === code.slice(0, 4) ? code : ''});
  else if (!device) showSetup('welcome');
  else showLock();
}
boot();
