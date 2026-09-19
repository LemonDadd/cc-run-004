// 习字格绘制（田字格 / 米字格 / 九宫 / 空白格 / 描红）。
// 统一输出到给定 SVG <g>，坐标为像素；格子内容由 caller 追加。

export const GRID_TYPES = [
  { id: 'tian', name: '田字格' },
  { id: 'mi', name: '米字格' },
  { id: 'jiugong', name: '九宫格' },
  { id: 'blank', name: '空白格' },
];

const GUIDE = 'rgba(214,73,62,0.55)';  // 红色辅助线
const BORDER = 'rgba(214,73,62,0.85)';
const GUIDE_DASH = '4,4';

// 单格辅助线（不含字）。x,y 为左上角，size 为边长。
export function gridGuidesSvg(type, x, y, size, opt = {}) {
  const guide = opt.guideColor || GUIDE;
  const border = opt.borderColor || BORDER;
  const sw = Math.max(1, size * 0.008);
  const cx = x + size / 2, cy = y + size / 2;
  const gsw = sw * 0.8;
  let s = '';
  // 外框
  s += `<rect x="${r(x)}" y="${r(y)}" width="${r(size)}" height="${r(size)}" fill="none" stroke="${border}" stroke-width="${r(sw)}"/>`;
  if (type === 'blank') return s;
  const dash = ` stroke-dasharray="${GUIDE_DASH}"`;
  if (type === 'tian' || type === 'mi' || type === 'jiugong') {
    s += `<line x1="${r(cx)}" y1="${r(y)}" x2="${r(cx)}" y2="${r(y + size)}" stroke="${guide}" stroke-width="${r(gsw)}"${dash}/>`;
    s += `<line x1="${r(x)}" y1="${r(cy)}" x2="${r(x + size)}" y2="${r(cy)}" stroke="${guide}" stroke-width="${r(gsw)}"${dash}/>`;
  }
  if (type === 'mi') {
    s += `<line x1="${r(x)}" y1="${r(y)}" x2="${r(x + size)}" y2="${r(y + size)}" stroke="${guide}" stroke-width="${r(gsw)}"${dash}/>`;
    s += `<line x1="${r(x + size)}" y1="${r(y)}" x2="${r(x)}" y2="${r(y + size)}" stroke="${guide}" stroke-width="${r(gsw)}"${dash}/>`;
  }
  if (type === 'jiugong') {
    for (const t of [1 / 3, 2 / 3]) {
      s += `<line x1="${r(x + size * t)}" y1="${r(y)}" x2="${r(x + size * t)}" y2="${r(y + size)}" stroke="${guide}" stroke-width="${r(gsw)}"${dash}/>`;
      s += `<line x1="${r(x)}" y1="${r(y + size * t)}" x2="${r(x + size)}" y2="${r(y + size * t)}" stroke="${guide}" stroke-width="${r(gsw)}"${dash}/>`;
    }
  }
  return s;
}

function r(v) { return Math.round(v * 100) / 100; }
