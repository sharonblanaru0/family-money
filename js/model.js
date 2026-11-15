// Family data model and calculations. Pure functions over the decrypted data:
// {schema, members:[{id,name,kind:'family'|'child',gender}], accounts:[...], entries:{accountId:[[day,value]...]}}

export const TYPES = {
  checking:   {label: 'עו״ש',        group: 'חשבונות עו״ש',     liq: 'now'},
  trading:    {label: 'תיק מסחר',    group: 'תיקי מסחר',        liq: 'now'},
  gemel:      {label: 'גמל להשקעה',  group: 'קופות גמל להשקעה', liq: 'now'},
  hishtalmut: {label: 'קרן השתלמות', group: 'קרנות השתלמות',    liq: 'later'},
  pension:    {label: 'פנסיה',       group: 'פנסיה',            liq: 'pension'},
  realestate: {label: 'נדל״ן',       group: 'נדל״ן',            liq: 'property'},
  mortgage:   {label: 'משכנתא',      group: 'התחייבויות',       liq: 'liability'},
};
export const TYPE_ORDER = ['checking', 'trading', 'gemel', 'hishtalmut', 'pension', 'realestate', 'mortgage'];
export const STALE_DAYS = 45;                      // balances older than this ask for an update
export const staleLimit = a => a.type === 'realestate' ? 365 : STALE_DAYS;   // property values change slowly

/* ---------- formatting ---------- */
const ILS = new Intl.NumberFormat('he-IL', {style: 'currency', currency: 'ILS', maximumFractionDigits: 0});
export const NUM = new Intl.NumberFormat('he-IL', {maximumFractionDigits: 0});
export const money = v => ILS.format(Math.round(v));
export const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
export const dstr = d => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
export const MON = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
export const MON_FULL = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const compact = v => '₪' + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(v / 1000) + 'K');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/* ---------- dates ---------- */
export const FAR = new Date(8.64e15);
const pad = n => String(n).padStart(2, '0');
export const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const validDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s));
export const days = (a, b) => Math.floor((b - a) / 86400000);
export const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2, '0')).join('');

/* ---------- data shape ---------- */
export const prodName = a => TYPES[a.type].label + (a.inactive ? ' לא פעילה' : '');

export function normAccount(a, memberIds) {
  const n = x => (x === '' || x == null || !isFinite(Number(x))) ? null : Number(x);
  return {
    id: a.id || uid(),
    type: TYPES[a.type] ? a.type : 'checking',
    inst: (a.inst || '').toString().trim().slice(0, 60) || null,
    name: (a.name || '').toString().trim().slice(0, 60) || null,
    owner: memberIds.has(a.owner) ? a.owner : 'family',
    fee: n(a.fee),
    dep: n(a.dep),
    liqDate: validDay(a.liqDate) ? a.liqDate : null,
    inactive: !!a.inactive,
    where: (a.where || '').toString().trim().slice(0, 200),
  };
}

export function newVault(structure = {}) {
  const members = [{id: 'family', name: 'הורים', kind: 'family'}];
  for (const m of structure.members || []) {
    if (m.id === 'family') { if (m.name) members[0].name = String(m.name).slice(0, 40); continue; }
    if (m.kind !== 'child' || !m.name) continue;
    members.push({id: m.id || uid(), name: String(m.name).trim().slice(0, 40), kind: 'child', gender: m.gender === 'f' ? 'f' : 'm'});
  }
  const ids = new Set(members.map(m => m.id));
  const accounts = (structure.accounts || []).filter(a => TYPES[a.type]).map(a => normAccount(a, ids));
  const now = new Date().toISOString();
  return {schema: 1, createdAt: now, updatedAt: now, members, accounts, entries: {}};
}

export function validateStructure(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.accounts) || !Array.isArray(s.members)) throw new Error('structure');
  return s;
}

/* ---------- balances ---------- */
export const entries = (v, id) => (v.entries[id] || []).map(([d, x]) => ({date: parseDay(d), value: x}));

export function latest(v, a, asOf = FAR) {
  let e = null;
  for (const x of entries(v, a.id)) if (x.date <= asOf) e = x;
  return e;
}

export function setEntry(v, id, day, value) {
  const list = (v.entries[id] || []).filter(([d]) => d !== day);
  list.push([day, value]);
  list.sort((p, q) => (p[0] < q[0] ? -1 : 1));
  v.entries[id] = list;
}

export function liqOf(a, asOf) {
  const t = TYPES[a.type].liq;
  if (t !== 'later') return t;
  return a.liqDate && parseDay(a.liqDate) <= asOf ? 'now' : 'later';
}

export function totals(v, asOf = FAR, today = new Date()) {
  const t = {assets: 0, liab: 0, liq: {now: 0, later: 0, pension: 0, property: 0}, type: {}, owner: {}, fees: 0, count: 0};
  const ref = asOf < FAR ? asOf : today;
  for (const a of v.accounts) {
    const e = latest(v, a, asOf);
    if (!e) continue;
    t.count++;
    if (TYPES[a.type].liq === 'liability') { t.liab += e.value; continue; }
    t.assets += e.value;
    t.liq[liqOf(a, ref)] += e.value;
    t.type[a.type] = (t.type[a.type] || 0) + e.value;
    t.owner[a.owner] = (t.owner[a.owner] || 0) + e.value;
    if (a.fee) t.fees += e.value * a.fee / 100;
  }
  t.net = t.assets - t.liab;
  return t;
}

export const monthEnds = (today, n = 12) =>
  Array.from({length: n}, (_, i) => new Date(today.getFullYear(), today.getMonth() - (n - 1) + i + 1, 0, 23, 59));

function firstDateOf(v, accs) {
  let f = null;
  for (const a of accs) {
    const l = v.entries[a.id];
    if (l && l.length) { const d = parseDay(l[0][0]); if (!f || d < f) f = d; }
  }
  return f;
}

export function lastDate(v) {
  let l = null;
  for (const list of Object.values(v.entries)) {
    if (list.length) { const d = parseDay(list[list.length - 1][0]); if (!l || d > l) l = d; }
  }
  return l;
}

// Month-end values, starting from the first month that has any data.
export function netSeries(v, today) {
  const f = firstDateOf(v, v.accounts);
  if (!f) return [];
  return monthEnds(today).filter(d => d >= f).map(d => ({d, v: totals(v, d, today).net}));
}

export function seriesFor(v, accs, today) {
  const f = firstDateOf(v, accs);
  if (!f) return [];
  return monthEnds(today).filter(d => d >= f).map(d => ({d, v: accs.reduce((s, a) => s + (latest(v, a, d)?.value || 0), 0)}));
}

export function staleDays(v, a, today) {
  const e = latest(v, a);
  return e ? days(e.date, today) : null;            // null: never entered
}
export const isStale = (v, a, today) => { const d = staleDays(v, a, today); return d === null || d > staleLimit(a); };
