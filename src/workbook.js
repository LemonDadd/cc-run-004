// 临摹本排版：按 A4 生成若干页 SVG。
// 模式：
//   demo   每字示范格（实心）+ 若干描红格 + 若干空格
//   trace  全部为淡灰描红
//   blank  全部空白格（仅在首格放小字示范，可选）
// 格子类型：tian / mi / jiugong / blank

import { gridGuidesSvg } from './grids.js';
import { charToSvg, escapeXml } from './charview.js';

export const PAGE = {
  w: 794,   // A4 @96dpi
  h: 1123,
  marginX: 48,
  marginY: 64,
  headerH: 46,
  footerH: 30,
};

const r = v => Math.round(v * 100) / 100;

// 每页布局参数
export function layoutPlan(opt = {}) {
  const cols = opt.cols || 10;
  const rows = opt.rows || 12;
  const gap = opt.gap == null ? 6 : opt.gap;
  const usableW = PAGE.w - PAGE.marginX * 2;
  const usableH = PAGE.h - PAGE.marginY * 2 - PAGE.headerH - PAGE.footerH;
  const size = Math.floor(Math.min(
    (usableW - gap * (cols - 1)) / cols,
    (usableH - gap * (rows - 1)) / rows
  ));
  return { cols, rows, gap, size, perPage: cols * rows };
}

// 生成格子序列：返回每页要放的「格」描述
// cell: { ch, kind: 'demo'|'trace'|'blank'|'small' }
export function buildCells(chars, mode, traceCount, blankCount) {
  const cells = [];
  if (mode === 'demo') {
    for (const ch of chars) {
      cells.push({ ch, kind: 'demo' });
      for (let i = 0; i < traceCount; i++) cells.push({ ch, kind: 'trace' });
      for (let i = 0; i < blankCount; i++) cells.push({ ch, kind: 'blank' });
    }
  } else if (mode === 'trace') {
    for (const ch of chars) cells.push({ ch, kind: 'trace' });
  } else { // blank
    for (const ch of chars) cells.push({ ch, kind: 'blank' });
  }
  return cells;
}

/**
 * 生成全部页面 SVG 字符串。
 * @param chars 汉字数组
 * @param opt { grid, mode, traceCount, blankCount, traceOpacity(0..1), cols, rows,
 *              title, showOrder(示范格笔画序号), charListInHeader }
 */
export function buildPages(chars, opt = {}) {
  const grid = opt.grid || 'tian';
  const mode = opt.mode || 'demo';
  const traceCount = opt.traceCount == null ? 2 : opt.traceCount;
  const blankCount = opt.blankCount == null ? 2 : opt.blankCount;
  const traceOpacity = opt.traceOpacity == null ? 0.28 : opt.traceOpacity;
  const plan = layoutPlan(opt);

  const cells = buildCells(chars, mode, traceCount, blankCount);
  const pages = [];
  const pageCount = Math.max(1, Math.ceil(cells.length / plan.perPage));

  for (let pg = 0; pg < pageCount; pg++) {
    pages.push(renderPage(cells.slice(pg * plan.perPage, (pg + 1) * plan.perPage), pg, pageCount, plan, {
      grid, mode, traceOpacity, title: opt.title || '', showOrder: !!opt.showOrder,
    }));
  }
  return pages;
}

function renderPage(cells, pageIdx, pageCount, plan, o) {
  const { cols, rows, gap, size } = plan;
  const startX = (PAGE.w - (cols * size + (cols - 1) * gap)) / 2;
  const startY = PAGE.marginY + PAGE.headerH;

  let body = '';
  // 页眉
  if (o.title) {
    body += `<text x="${r(PAGE.marginX)}" y="${r(PAGE.marginY + 20)}" font-family="KaiTi,STKaiti,serif" font-size="18" fill="#333">${escapeXml(o.title)}</text>`;
  }
  body += `<text x="${r(PAGE.w - PAGE.marginX)}" y="${r(PAGE.marginY + 20)}" text-anchor="end" font-family="sans-serif" font-size="11" fill="#999">汉字笔顺临摹本</text>`;

  cells.forEach((cell, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (size + gap);
    const y = startY + row * (size + gap);
    // 空白格不画字（但仍可放小示范）；demo/trace 画格线
    const gtype = (cell.kind === 'blank' && o.grid === 'blank') ? 'blank' : o.grid;
    body += gridGuidesSvg(gtype, x, y, size);

    if (cell.kind === 'demo') {
      body += charToSvg(cell.ch, x, y, size, { color: '#1a1a1a', opacity: 0.92 });
      // 角标：笔顺/字
      body += `<text x="${r(x + 4)}" y="${r(y + size - 4)}" font-family="sans-serif" font-size="${r(size * 0.1)}" fill="#c0392b" opacity="0.75">范</text>`;
    } else if (cell.kind === 'trace') {
      body += charToSvg(cell.ch, x, y, size, { color: '#9a9a9a', opacity: o.traceOpacity });
    } else {
      // 空白格：右上角极小示范字（可关闭时不画）
      if (o.smallGuide !== false) {
        const gs = size * 0.26;
        body += charToSvg(cell.ch, x + size - gs - 3, y + 3, gs, { color: '#bbb', opacity: 0.6 });
      }
    }
  });

  // 页脚页码
  body += `<text x="${r(PAGE.w / 2)}" y="${r(PAGE.h - PAGE.marginY + 6)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#999">${pageIdx + 1} / ${pageCount}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}">
<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
${body}
</svg>`;
}
