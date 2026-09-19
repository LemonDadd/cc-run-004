// 把一个汉字渲染进指定矩形（SVG group / Canvas），处理数据坐标→像素的映射。
// makemeahanzi 数据理论范围 0..1024，实际个别笔略超出，统一加边距并等比缩放。

import { buildChar, strokeOutlinePath } from './geometry.js';
import { getChar } from './data.js';

const DATA_N = 1024;
const PAD_RATIO = 0.085; // 字在格内四周留白

const charCache = new Map();
export function getCharGeom(ch) {
  if (charCache.has(ch)) return charCache.get(ch);
  const med = getChar(ch);
  if (!med) { charCache.set(ch, null); return null; }
  const geom = buildChar(med);
  charCache.set(ch, geom);
  return geom;
}

// 计算 1024 数据坐标 → 目标矩形的变换
export function glyphTransform(size) {
  const pad = size * PAD_RATIO;
  const inner = size - pad * 2;
  const scale = inner / DATA_N;
  return { pad, scale };
}

function r(v) { return Math.round(v * 100) / 100; }

/**
 * 渲染单字为 SVG <g> 内容字符串。
 * @param ch 汉字
 * @param x,y 格子左上；size 格边长
 * @param opt { opacity, color, progress(每笔数组或单值), showOutline(底字), outlineColor }
 */
export function charToSvg(ch, x, y, size, opt = {}) {
  const geom = getCharGeom(ch);
  const { pad, scale } = glyphTransform(size);
  const ox = x + pad, oy = y + pad;
  const color = opt.color || '#1a1a1a';
  const opacity = opt.opacity == null ? 1 : opt.opacity;

  let out = '';
  if (!geom) {
    // 无笔顺数据：退回系统楷体字（仍可显示/打印，只是没有逐笔数据）
    const fs = DATA_N * 0.78;
    out += `<text x="${r(x + size / 2)}" y="${r(y + size / 2 + fs * scale * 0.36)}" `
      + `text-anchor="middle" font-family="KaiTi,STKaiti,楷体,serif" font-size="${r(fs * scale)}" `
      + `fill="${color}" opacity="${opacity}">${escapeXml(ch)}</text>`;
    return out;
  }

  out = `<g transform="translate(${r(ox)},${r(oy)}) scale(${r(scale)})">`;

  // 淡灰底字（描红模式下作为上一层参考，或动画完成前的轮廓）
  if (opt.showOutline) {
    const oc = opt.outlineColor || 'rgba(180,180,180,0.5)';
    geom.forEach(st => {
      out += `<path d="${strokeOutlinePath(st, 1)}" fill="${oc}"/>`;
    });
  }

  const progs = opt.progress;
  geom.forEach((st, i) => {
    const p = Array.isArray(progs) ? (progs[i] == null ? 0 : progs[i]) : (progs == null ? 1 : progs);
    if (p <= 0.001) return;
    out += `<path d="${strokeOutlinePath(st, p)}" fill="${color}" opacity="${opacity}"/>`;
  });
  out += '</g>';
  return out;
}

export function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
