// Dependency-free SVG charts. All text goes through textContent (no HTML injection).
const NS = 'http://www.w3.org/2000/svg';
// Blue-led palette; the first two are the income/expense pair used across the app.
export const COLORS = ['#2563eb', '#38bdf8', '#1e3a8a', '#7dd3fc', '#6366f1', '#0891b2', '#93c5fd', '#0ea5e9', '#64748b'];
export const C_INCOME = '#2563eb';
export const C_EXPENSE = '#38bdf8';
export const C_OVER = '#ef4444';
export const C_PREV = '#bfdbfe';

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export const inr = (n, digits = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: digits }).format(n);
export const short = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : String(Math.round(a));
  return n < 0 ? `-${s}` : s;
};
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function root(w, h, label) {
  return el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, class: 'chart' });
}

// Round the axis range to a 1/2/2.5/5 step so gridlines land on readable numbers.
function niceRange(min, max, ticks = 4) {
  if (max === min) { max = min + 1; }
  const raw = (max - min) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

function yAxis(svg, { lo, hi, step }, m, W, H, fmt) {
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  for (let v = lo; v <= hi + step / 2; v += step) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'gl' }));
    svg.append(el('text', { x: m.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, fmt(v)));
  }
  return y;
}

// series: [{name, color, values:[number|null]}]; null values are omitted, not drawn as zero.
export function groupedBars({ labels, series, label }) {
  const W = 480; const H = 240; const m = { l: 46, r: 8, t: 12, b: 28 };
  const svg = root(W, H, label);
  const vals = series.flatMap((s) => s.values).filter((v) => v !== null);
  const rng = niceRange(Math.min(0, ...vals), Math.max(1, ...vals));
  const y = yAxis(svg, rng, m, W, H, short);
  const gw = (W - m.l - m.r) / labels.length;
  const bw = Math.min(14, (gw - 6) / series.length);
  labels.forEach((lab, i) => {
    const x0 = m.l + gw * i + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i];
      if (v === null || v === 0) return;
      const top = y(Math.max(v, 0)); const bot = y(Math.min(v, 0));
      const r = el('rect', { x: x0 + bw * j, y: top, width: bw - 1, height: Math.max(1, bot - top), rx: 3, fill: s.color, class: 'vb' });
      r.append(el('title', {}, `${lab} ${s.name}: ${inr(v)}`));
      svg.append(r);
    });
    svg.append(el('text', { x: m.l + gw * i + gw / 2, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, lab));
  });
  return svg;
}

// Lines with optional soft area fill. Null values break the line (not drawn as zero).
export function lineChart({ labels, series, label, fmt = short, zeroLine = false }) {
  const W = 480; const H = 240; const m = { l: 46, r: 12, t: 12, b: 28 };
  const svg = root(W, H, label);
  const vals = series.flatMap((s) => s.values).filter((v) => v !== null);
  if (!vals.length) { svg.append(el('text', { x: W / 2, y: H / 2, class: 'axis', 'text-anchor': 'middle' }, 'No data yet')); return svg; }
  const rng = niceRange(zeroLine ? Math.min(0, ...vals) : Math.min(...vals), Math.max(...vals));
  const y = yAxis(svg, rng, m, W, H, fmt);
  const x = (i) => m.l + ((W - m.l - m.r) * (i + 0.5)) / labels.length;
  labels.forEach((lab, i) => svg.append(el('text', { x: x(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, lab)));
  series.forEach((s) => {
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        const pts = seg.map(([i, v]) => `${x(i)},${y(v)}`);
        if (s.area) svg.append(el('path', { d: `M${x(seg[0][0])},${y(rng.lo)} L${pts.join(' L')} L${x(seg[seg.length - 1][0])},${y(rng.lo)}Z`, fill: s.color, 'fill-opacity': 0.14 }));
        svg.append(el('path', { d: `M${pts.join(' L')}`, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'ln' }));
      }
      seg = [];
    };
    s.values.forEach((v, i) => { if (v === null) flush(); else seg.push([i, v]); });
    flush();
    s.values.forEach((v, i) => {
      if (v === null) return;
      const c = el('circle', { cx: x(i), cy: y(v), r: 4, fill: '#fff', stroke: s.color, 'stroke-width': 2.5 });
      c.append(el('title', {}, `${labels[i]} ${s.name}: ${fmt === short ? inr(v) : fmt(v)}`));
      svg.append(c);
    });
  });
  return svg;
}

// items: [{label, value, limit?, over?}]. A tick marks the limit when present.
export function hBars({ items, label }) {
  const rowH = 30; const W = 480; const lw = 112; const H = Math.max(40, items.length * rowH + 8);
  const svg = root(W, H, label);
  const max = Math.max(1, ...items.map((i) => Math.max(i.value, i.limit || 0)));
  const bw = W - lw - 84;
  items.forEach((it, i) => {
    const yy = 4 + i * rowH;
    svg.append(el('text', { x: lw - 6, y: yy + 17, class: 'axis', 'text-anchor': 'end' }, trunc(it.label, 16)));
    svg.append(el('rect', { x: lw, y: yy + 4, width: bw, height: 16, rx: 8, class: 'track' }));
    const w = Math.max(0, (Math.max(it.value, 0) / max) * bw);
    const bar = el('rect', { x: lw, y: yy + 4, width: w, height: 16, rx: 8, fill: it.over ? C_OVER : (it.color || COLORS[0]), class: 'hb' });
    bar.append(el('title', {}, `${it.label}: ${inr(it.value)}${it.limit !== undefined ? ` of ${inr(it.limit)}` : ''}`));
    svg.append(bar);
    if (it.limit !== undefined) svg.append(el('line', { x1: lw + (it.limit / max) * bw, x2: lw + (it.limit / max) * bw, y1: yy + 1, y2: yy + 23, class: 'limit' }));
    svg.append(el('text', { x: lw + bw + 6, y: yy + 17, class: 'axis' }, inr(it.value)));
  });
  return svg;
}

// Paired horizontal bars: items [{label, previous, current}] for a before/after comparison.
export function compareBars({ items, label }) {
  const rowH = 40; const W = 480; const lw = 112; const H = Math.max(40, items.length * rowH + 8);
  const svg = root(W, H, label);
  const max = Math.max(1, ...items.map((i) => Math.max(i.previous, i.current)));
  const bw = W - lw - 84;
  items.forEach((it, i) => {
    const yy = 4 + i * rowH;
    svg.append(el('text', { x: lw - 6, y: yy + 20, class: 'axis', 'text-anchor': 'end' }, trunc(it.label, 16)));
    [['previous', C_PREV, 'Previous'], ['current', COLORS[0], 'This month']].forEach(([k, color, name], j) => {
      const w = Math.max(0, (Math.max(it[k], 0) / max) * bw);
      const bar = el('rect', { x: lw, y: yy + 3 + j * 15, width: Math.max(w, 1), height: 12, rx: 6, fill: color, class: 'hb' });
      bar.append(el('title', {}, `${it.label} ${name}: ${inr(it[k])}`));
      svg.append(bar);
      svg.append(el('text', { x: lw + w + 6, y: yy + 13 + j * 15, class: 'axis small' }, inr(it[k])));
    });
  });
  return svg;
}

export function donut({ items, label, centre }) {
  const size = 200; const r = 78; const sw = 30; const c = size / 2;
  const svg = root(size, size, label);
  const total = items.reduce((a, i) => a + i.value, 0);
  if (total <= 0) { svg.append(el('circle', { cx: c, cy: c, r, class: 'donut-empty' })); return svg; }
  let acc = 0; const circ = 2 * Math.PI * r;
  items.forEach((it, i) => {
    const len = (it.value / total) * circ;
    const dash = Math.max(len - 1.5, 0.5);
    const seg = el('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: COLORS[i % COLORS.length], 'stroke-width': sw,
      'stroke-dasharray': `${dash} ${circ - dash}`, 'stroke-dashoffset': -acc, transform: `rotate(-90 ${c} ${c})`, class: 'seg',
    });
    seg.append(el('title', {}, `${it.label}: ${inr(it.value)} (${((it.value / total) * 100).toFixed(1)}%)`));
    svg.append(seg);
    acc += len;
  });
  svg.append(el('text', { x: c, y: c - 2, class: 'donut-total', 'text-anchor': 'middle' }, short(total)));
  svg.append(el('text', { x: c, y: c + 16, class: 'axis', 'text-anchor': 'middle' }, centre || 'total'));
  return svg;
}
