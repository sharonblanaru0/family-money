// Single-series line chart with a touch/hover crosshair and tooltip.

import {money, compact, esc, MON, MON_FULL} from './model.js';

function niceTicks(min, max, n = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / (n - 1), mag = 10 ** Math.floor(Math.log10(raw)), nr = raw / mag;
  const step = (nr <= 1 ? 1 : nr <= 2 ? 2 : nr <= 2.5 ? 2.5 : nr <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(v);
  return out;
}

export function lineChart(host, pts, {height = 176, label = 'שווי נקי'} = {}) {
  if (!host || pts.length < 2) return;
  const W = host.clientWidth || 320, H = height, pl = 46, pr = 8, pt = 10, pb = 24;
  const ticks = niceTicks(Math.min(...pts.map(p => p.v)), Math.max(...pts.map(p => p.v)));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const li = pts.length - 1;
  const X = i => pl + i * (W - pl - pr) / li;
  const Y = v => pt + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - pt - pb);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
  const every = pts.length > 6 ? 3 : 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(label)} לאורך זמן">`;
  s += '<g class="yax">' + ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--rule)"/><text x="${pl - 8}" y="${Y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('') + '</g>';
  s += pts.map((p, i) => ((li - i) % every === 0) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${MON[p.d.getMonth()]}</text>` : '').join('');
  s += `<path d="${line}L${X(li)} ${H - pb}L${X(0)} ${H - pb}Z" fill="var(--s1)" opacity=".09"/>`;
  s += `<path d="${line}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<circle cx="${X(li)}" cy="${Y(pts[li].v)}" r="4" fill="var(--s1)" stroke="var(--paper)" stroke-width="2"/>`;
  s += `<line class="xh" y1="${pt}" y2="${H - pb}" stroke="var(--ink-3)" visibility="hidden"/><circle class="xm" r="4" fill="var(--s1)" stroke="var(--paper)" stroke-width="2" visibility="hidden"/>`;
  s += `<rect x="${pl}" y="0" width="${W - pl - pr}" height="${H}" fill="transparent" style="touch-action:pan-y"/></svg><div class="tip"></div>`;
  host.innerHTML = s;

  const svg = host.querySelector('svg'), hit = svg.querySelector('rect');
  const xh = svg.querySelector('.xh'), xm = svg.querySelector('.xm'), tip = host.querySelector('.tip');
  const show = ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(li, Math.round((x - pl) / ((W - pl - pr) / li))));
    const cx = X(i), cy = Y(pts[i].v);
    xh.setAttribute('x1', cx); xh.setAttribute('x2', cx); xh.setAttribute('visibility', 'visible');
    xm.setAttribute('cx', cx); xm.setAttribute('cy', cy); xm.setAttribute('visibility', 'visible');
    tip.innerHTML = `${MON_FULL[pts[i].d.getMonth()]} ${pts[i].d.getFullYear()}<b class="amt">${money(pts[i].v)}</b>`;
    const half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(r.width - half, cx * r.width / W)) + 'px';
    tip.style.top = (cy * r.height / H - 10) + 'px';
    tip.classList.add('on');
  };
  const hide = () => { xh.setAttribute('visibility', 'hidden'); xm.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); };
  ['pointermove', 'pointerdown'].forEach(e => hit.addEventListener(e, show));
  ['pointerleave', 'pointercancel'].forEach(e => hit.addEventListener(e, hide));
}
