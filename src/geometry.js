// 笔画几何：把中线（1024 坐标系）转成可变宽度的带状路径。
// 同时供 SVG path（动画、字帖）与 Canvas（PNG/PDF）使用。
//
// 沿中线两侧按「半宽」做 miter（尖角）偏移，首尾圆头封边；
// 支持 progress∈[0,1] 沿弧长截断，用于逐笔揭示动画。

import { classifyStroke } from './stroketype.js';

const HALF_BASE = 42;

// 每种笔画在「起笔 / 行笔中段 / 收笔」的半宽系数
const WIDTH_PROFILE = {
  '横': { start: 1.05, mid: 0.92, end: 1.0 },
  '竖': { start: 1.05, mid: 0.95, end: 0.92 },
  '撇': { start: 1.15, mid: 0.85, end: 0.12 },
  '捺': { start: 0.35, mid: 0.9, end: 1.12 },
  '点': { start: 0.6, mid: 1.12, end: 0.85 },
  '折': { start: 1.05, mid: 0.95, end: 0.92 },
  '提': { start: 1.1, mid: 0.8, end: 0.14 },
};

const MITER_LIMIT = 2.4;

function halfWidthAt(type, t) {
  const p = WIDTH_PROFILE[type] || WIDTH_PROFILE['折'];
  const w = t < 0.5
    ? p.start + (p.mid - p.start) * (t / 0.5)
    : p.mid + (p.end - p.mid) * ((t - 0.5) / 0.5);
  return Math.max(0.6, HALF_BASE * w);
}

function buildStroke(median, type) {
  const pts = median;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1] || 1;
  const tang = [];
  for (let i = 0; i < pts.length; i++) {
    let tx, ty;
    if (i === 0) { tx = pts[1][0] - pts[0][0]; ty = pts[1][1] - pts[0][1]; }
    else if (i === pts.length - 1) { tx = pts[i][0] - pts[i - 1][0]; ty = pts[i][1] - pts[i - 1][1]; }
    else { tx = pts[i + 1][0] - pts[i - 1][0]; ty = pts[i + 1][1] - pts[i - 1][1]; }
    const tl = Math.hypot(tx, ty) || 1;
    tang.push([tx / tl, ty / tl]);
  }
  const hw = pts.map((_, i) => halfWidthAt(type, cum[i] / total));
  return { pts, cum, total, tang, hw, type };
}

export function buildChar(medians) {
  const types = medians.map(classifyStroke);
  return medians.map((m, i) => buildStroke(m, types[i]));
}

// 两段（过点 p，方向 t0→t1）等距偏移 h 后在侧 side 的交点
function miterPoint(p, t0, t1, h, side) {
  const a = [p[0] + (-t0[1] * side) * h, p[1] + (t0[0] * side) * h];
  const det = t0[0] * (-t1[1]) - t0[1] * (-t1[0]);
  if (Math.abs(det) < 1e-6) return null;
  const lam = ((p[0] + (-t1[1] * side) * h - a[0]) * (-t1[1])
             - (p[1] + (t1[0] * side) * h - a[1]) * (-t1[0])) / det;
  const q = [a[0] + lam * t0[0], a[1] + lam * t0[1]];
  if (Math.hypot(q[0] - p[0], q[1] - p[1]) > h * MITER_LIMIT) return null;
  return q;
}

function sampleAt(st, arc) {
  const { pts, cum, total, tang, hw } = st;
  if (arc <= 0) return { x: pts[0][0], y: pts[0][1], tx: tang[0][0], ty: tang[0][1], hw: hw[0] };
  if (arc >= total) {
    const i = pts.length - 1;
    return { x: pts[i][0], y: pts[i][1], tx: tang[i][0], ty: tang[i][1], hw: hw[i] };
  }
  let i = 1;
  while (i < cum.length - 1 && cum[i] < arc) i++;
  const segL = cum[i] - cum[i - 1] || 1;
  const f = (arc - cum[i - 1]) / segL;
  const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
  const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
  const txx = tang[i - 1][0] + (tang[i][0] - tang[i - 1][0]) * f;
  const tyy = tang[i - 1][1] + (tang[i][1] - tang[i - 1][1]) * f;
  const tl = Math.hypot(txx, tyy) || 1;
  return { x, y, tx: txx / tl, ty: tyy / tl, hw: halfWidthAt(st.type, arc / total) };
}

function f1(v) { return Math.round(v * 10) / 10; }

// 起笔到弧长 arc 的单侧偏移折线（side +1 左 / -1 右，相对行进方向）
function offsetSide(st, arc, side) {
  const { pts, cum, tang, hw, total } = st;
  const out = [[pts[0][0] + (-tang[0][1] * side) * hw[0],
                pts[0][1] + (tang[0][0] * side) * hw[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] > arc) break;
    const h = hw[i];
    const m = miterPoint(pts[i], tang[i - 1], tang[i], h, side);
    if (m) out.push(m);
    else {
      out.push([pts[i][0] + (-tang[i - 1][1] * side) * h, pts[i][1] + (tang[i - 1][0] * side) * h]);
      out.push([pts[i][0] + (-tang[i][1] * side) * h, pts[i][1] + (tang[i][0] * side) * h]);
    }
  }
  if (arc < total) {
    const s = sampleAt(st, arc);
    out.push([s.x + (-s.ty * side) * s.hw, s.y + (s.tx * side) * s.hw]);
  }
  return out;
}

/** 单笔填充路径；progress 0..1 沿弧长揭示 */
export function strokeOutlinePath(st, progress = 1) {
  const arc = st.total * Math.max(0, Math.min(1, progress));
  if (arc <= 0.0001) return '';
  const left = offsetSide(st, arc, +1);
  const right = offsetSide(st, arc, -1);

  let d = `M${f1(left[0][0])},${f1(left[0][1])} `;
  for (let i = 1; i < left.length; i++) d += `L${f1(left[i][0])},${f1(left[i][1])} `;
  const cap = sampleAt(st, arc);
  d += `A${f1(cap.hw)},${f1(cap.hw)} 0 1,0 ${f1(right[right.length - 1][0])},${f1(right[right.length - 1][1])} `;
  for (let i = right.length - 2; i >= 0; i--) d += `L${f1(right[i][0])},${f1(right[i][1])} `;
  d += `A${f1(st.hw[0])},${f1(st.hw[0])} 0 1,0 ${f1(left[0][0])},${f1(left[0][1])} Z`;
  return d;
}

export function strokeTotalLength(st) { return st.total; }
