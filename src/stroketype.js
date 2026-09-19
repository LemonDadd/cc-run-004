// 笔画类型识别：横、竖、撇、捺、点、折（内部细分“提”用于更准确的渲染）
// 依据 makemeahanzi 中线几何特征判定。
//
// 视图坐标 1024x1024，y 向下，中线「起笔→收笔」，deg=atan2(dy,dx)∈(-180,180]：
//   横 ≈0 | 竖 ≈+90 | 撇(向左下) ∈(90,180] | 捺(向右下) ∈(15,90)
//   提(向右上) ∈(-90,-15)（右行且上扬，含三点水末笔）

export const STROKE_TYPES = ['横', '竖', '撇', '捺', '点', '折', '提'];

function segLen(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function strokeLength(m) {
  let L = 0;
  for (let i = 1; i < m.length; i++) L += segLen(m[i - 1], m[i]);
  return L;
}

// Ramer–Douglas–Peucker
function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    const a = points[lo], b = points[hi];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const ab = Math.hypot(dx, dy) || 1;
    let dmax = 0, idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const p = points[i];
      const d = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / ab;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps && idx > 0) {
      keep[idx] = true;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// 简化为粗折线：合并长度不足 minSeg 的碎段（用于找主折点）
function coarsePolyline(m, minSeg = 170) {
  const simp = rdp(m, 14);
  const out = [simp[0]];
  let acc = 0;
  for (let i = 1; i < simp.length; i++) {
    acc += segLen(out[out.length - 1], simp[i]);
    if (acc >= minSeg || i === simp.length - 1) {
      out.push(simp[i]);
      acc = 0;
    }
  }
  return out;
}

function segAng(a, b) {
  return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
}

function angDiff(a, b) {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}

// 是否为折笔（横折/竖折/横撇/竖弯等）：粗折线上存在主方向急变。
// 不算折：竖钩/横钩（转折在末端、钩段短）；撇捺（粗折线合并后方向连续）。
function isFold(m, L) {
  if (L < 200) return false;
  const poly = coarsePolyline(m);
  if (poly.length < 3) return false;
  const angs = [], lens = [];
  for (let i = 1; i < poly.length; i++) {
    angs.push(segAng(poly[i - 1], poly[i]));
    lens.push(segLen(poly[i - 1], poly[i]));
  }
  const total = lens.reduce((a, b) => a + b, 0);
  for (let i = 1; i < angs.length; i++) {
    if (angDiff(angs[i], angs[i - 1]) < 55) continue;
    const head = lens[i - 1], tail = lens[i];
    // 主折要求两段都是笔的主体（各占足够比例），从而排除末端钩
    if (head < 150 || tail < 150) continue;
    if (Math.min(head, tail) / total < 0.16) continue;
    return true;
  }
  return false;
}

// 竖撇：主体竖直向下，末段明显摆向左
function isVerticalPie(m) {
  const L = strokeLength(m);
  // 沿中线行进到 55% 处，之前方向应接近竖直向下
  if (L < 320) return false;
  const cum = [0];
  for (let i = 1; i < m.length; i++) cum.push(cum[i - 1] + segLen(m[i - 1], m[i]));
  const at = t => {
    const target = L * t;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    return m[Math.min(i, m.length - 1)];
  };
  const p0 = m[0], pm = at(0.55), pe = m[m.length - 1];
  const aMid = segAng(p0, pm);
  if (Math.abs(aMid - 90) > 32) return false;
  // 收笔相对中段明显偏左
  if (pe[0] >= pm[0] - 60) return false;
  return true;
}

function endAngle(m) {
  const s = m[0], e = m[m.length - 1];
  let a = Math.atan2(e[1] - s[1], e[0] - s[0]) * 180 / Math.PI;
  if (a <= -180) a += 360;
  return a;
}

/** @returns {'横'|'竖'|'撇'|'捺'|'点'|'折'|'提'} */
export function classifyStroke(m) {
  if (m.length < 2) return '点';
  const L = strokeLength(m);

  const deg = endAngle(m);

  // 竖钩 / 弯钩：前段长距离竖直下行，仅末端一小段钩（钩后不再延续长笔）。
  // 须在折检测之前判定，以免末端钩被当成折点。
  if (L >= 300) {
    const v = verticalHookInfo(m, L);
    if (v === 'hook') return '竖';
    if (v === 'pie') return '撇';
  }

  if (isFold(m, L)) return '折';

  // 短笔：点（含侧点、左点）/ 短撇 / 短提
  if (L < 300) {
    if (deg > 90 && deg <= 180) return '撇';
    if (deg < -15 && deg > -90) return '提';
    return '点';
  }

  if (Math.abs(deg) <= 15) return '横';
  if (deg > 78 && deg < 102) return '竖';
  if (deg >= 15 && deg <= 78) return '捺';
  if (deg > 102 && deg <= 180) return '撇';
  if (deg < -15 && deg > -90) return '提';
  return '竖';
}

// 沿中线累计长度，返回行进到比例 t 处的点
function pointAt(m, cum, L, t) {
  const target = L * t;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  return { p: m[i], idx: i };
}

// 检测竖钩 / 竖撇：'hook'（末端短钩，主体竖直）| 'pie'（末段长摆向左）| null
function verticalHookInfo(m, L) {
  const cum = [0];
  for (let i = 1; i < m.length; i++) cum.push(cum[i - 1] + segLen(m[i - 1], m[i]));
  // 起笔到 65% 处方向近竖直向下（普通斜撇在此处已明显偏斜，被排除）
  const { p: p65 } = pointAt(m, cum, L, 0.65);
  const headA = segAng(m[0], p65);
  if (Math.abs(headA - 90) > 18) return null;
  // 收笔处切线方向（用 RDP 末段；平滑笔退化到末两个采样点）
  const simp = rdp(m, 20);
  const a = simp[simp.length - 2], b = simp[simp.length - 1];
  const tailA = segAng(a, b);
  const tailL = segLen(a, b);
  // 竖钩：末段短且向左上/平出（tailA < 90，含角度接近水平左出）
  if (tailL < L * 0.32 && tailA < 92) return 'hook';
  // 竖撇：末段继续向左下（tailA > 100），无论长短
  if (tailA > 100) return 'pie';
  return null;
}

export function classifyChar(medians) {
  return medians.map(classifyStroke);
}
