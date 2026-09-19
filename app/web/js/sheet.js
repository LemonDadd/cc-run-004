// sheet.js - copybook page layout (SVG, A4) + PNG/PDF export
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const DIM = 1024;

  // A4 portrait at 96dpi: 794 x 1123 px
  const PAGE = { w: 794, h: 1123, marginX: 40, marginTop: 56, marginBottom: 44 };

  const GRID = {
    tian: '田字格',
    mi: '米字格',
    trace: '描红',
    blank: '空白格',
  };

  function el(name, attrs) {
    const node = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  }

  // expand user input into a per-cell plan
  // pattern modes:
  //   1描N空  : trace cell + n practice cells per char
  //   alltrace: every cell traced
  //   blank   : one char per group, no trace (just grids)
  function planCells(chars, opts) {
    const cells = [];
    for (const ch of chars) {
      if (opts.trace) {
        // one trace cell + N practice grids per character
        cells.push({ ch, kind: 'trace' });
        for (let i = 0; i < opts.blanks; i++) {
          cells.push({ ch: i === 0 ? ch : null, kind: 'grid', hint: i === 0 });
        }
      } else {
        // no tracing: grids only, first cell labelled with pinyin
        for (let i = 0; i < opts.blanks + 1; i++) {
          cells.push({ ch: i === 0 ? ch : null, kind: 'grid', hint: i === 0 });
        }
      }
    }
    return cells;
  }

  function gridMarks(g, size, type) {
    const c = size / 2;
    if (type === 'blank') return;
    if (type === 'tian' || type === 'mi') {
      const line = (x1, y1, x2, y2, dash) => {
        const attrs = {
          x1, y1, x2, y2, stroke: '#e8767d', 'stroke-width': 0.9,
        };
        if (dash) attrs['stroke-dasharray'] = '4 3';
        g.appendChild(el('line', attrs));
      };
      line(c, 0, c, size, true);
      line(0, c, size, c, true);
    }
    if (type === 'mi') {
      const diag = (x1, y1, x2, y2) => g.appendChild(el('line', {
        x1, y1, x2, y2, stroke: '#f0a7ac', 'stroke-width': 0.7, 'stroke-dasharray': '3 3',
      }));
      diag(0, 0, size, size);
      diag(size, 0, 0, size);
    }
  }

  function drawCharShape(g, ch, strokes, size, opts) {
    const pad = opts.charPad != null ? opts.charPad : 0.07; // 7% padding
    const inner = size * (1 - pad * 2);
    const s = inner / DIM;
    // data is y-up: translate into padded box, scale, then flip vertically
    const group = el('g', {
      transform: `translate(${size * pad},${size * pad}) scale(${s},${-s}) translate(0,${-DIM})`,
    });
    const opacity = opts.traceOpacity != null ? opts.traceOpacity : 0.28;
    for (const st of strokes) {
      group.appendChild(el('path', {
        d: StrokeData.toPathD(st.segments),
        fill: opts.traceColor || '#c0392b',
        'fill-opacity': opacity,
        stroke: 'none',
      }));
    }
    g.appendChild(group);
  }

  function drawPinyin(g, text, size) {
    const t = el('text', {
      x: size / 2,
      y: size - 6,
      'text-anchor': 'middle',
      'font-size': Math.max(10, size * 0.16),
      fill: '#9aa3ab',
      'font-family': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
    });
    t.textContent = text || '';
    g.appendChild(t);
  }

  // Build one A4 SVG page.
  // pageCells: [{ch, kind}] ; pinyinMap: char -> string
  function buildPage(pageCells, index, total, opts, pinyinMap) {
    const svg = el('svg', {
      xmlns: SVGNS,
      width: PAGE.w, height: PAGE.h,
      viewBox: `0 0 ${PAGE.w} ${PAGE.h}`,
      class: 'sheet-page',
    });
    svg.appendChild(el('rect', { x: 0, y: 0, width: PAGE.w, height: PAGE.h, fill: '#fff' }));

    // header
    if (opts.title && index === 0) {
      const t = el('text', {
        x: PAGE.marginX, y: 34,
        'font-size': 18, 'font-weight': 700, fill: '#333',
        'font-family': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      });
      t.textContent = opts.title;
      svg.appendChild(t);
    }
    if (opts.subtitle) {
      const t = el('text', {
        x: PAGE.w - PAGE.marginX, y: 34, 'text-anchor': 'end',
        'font-size': 11, fill: '#999',
        'font-family': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      });
      t.textContent = opts.subtitle;
      svg.appendChild(t);
    }

    const size = opts.cellSize || 112;
    const gap = opts.gap != null ? opts.gap : 6;
    const cols = Math.floor((PAGE.w - PAGE.marginX * 2 + gap) / (size + gap));
    const rows = Math.floor((PAGE.h - PAGE.marginTop - PAGE.marginBottom + gap) / (size + gap));
    const startX = (PAGE.w - (cols * size + (cols - 1) * gap)) / 2;
    const startY = PAGE.marginTop;

    let n = 0;
    for (let r = 0; r < rows && n < pageCells.length; r++) {
      for (let c = 0; c < cols && n < pageCells.length; c++) {
        const cell = pageCells[n++];
        const x = startX + c * (size + gap);
        const y = startY + r * (size + gap);
        const g = el('g', { transform: `translate(${x},${y})` });
        g.appendChild(el('rect', {
          x: 0, y: 0, width: size, height: size,
          fill: '#fff', stroke: '#d95a63', 'stroke-width': 1,
        }));
        gridMarks(g, size, cell.kind === 'trace' ? opts.traceGrid : opts.grid);
        svg.appendChild(g);
        cell._box = { g, size };
      }
    }

    // footer page number
    const ft = el('text', {
      x: PAGE.w / 2, y: PAGE.h - 20, 'text-anchor': 'middle',
      'font-size': 10, fill: '#bbb',
      'font-family': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
    });
    ft.textContent = `${index + 1} / ${total}`;
    svg.appendChild(ft);

    return { svg, cells: pageCells.filter((c) => c._box) };
  }

  // Build all pages as SVG elements; chars data resolved via StrokeData (sync cache).
  function buildPages(chars, strokesMap, opts, pinyinMap) {
    const cells = planCells(chars, opts);
    const size = opts.cellSize || 112;
    const gap = opts.gap != null ? opts.gap : 6;
    const cols = Math.floor((PAGE.w - PAGE.marginX * 2 + gap) / (size + gap));
    const rows = Math.floor((PAGE.h - PAGE.marginTop - PAGE.marginBottom + gap) / (size + gap));
    const perPage = cols * rows;
    const pageCount = Math.max(1, Math.ceil(cells.length / perPage));

    const pages = [];
    for (let p = 0; p < pageCount; p++) {
      const slice = cells.slice(p * perPage, (p + 1) * perPage);
      const { svg } = buildPage(slice, p, pageCount, opts, pinyinMap || {});
      // paint characters into their boxes now
      for (const cell of slice) {
        if (!cell._box || !cell.ch) continue;
        const strokes = strokesMap[cell.ch];
        if (!strokes) continue;
        if (cell.kind === 'trace') {
          drawCharShape(cell._box.g, cell.ch, strokes, cell._box.size, opts);
        }
        if (opts.showPinyin && pinyinMap && pinyinMap[cell.ch] &&
            (cell.kind === 'trace' || cell.hint)) {
          drawPinyin(cell._box.g, pinyinMap[cell.ch], cell._box.size);
        }
      }
      pages.push(svg);
    }
    return pages;
  }

  function serialize(svgNode) {
    const clone = svgNode.cloneNode(true);
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', SVGNS);
    let str = new XMLSerializer().serializeToString(clone);
    // some serializers emit a duplicate xmlns attribute; collapse them so
    // strict SVG parsers (rsvg/ImageMagick) accept the document
    str = str.replace(
      /(xmlns="http:\/\/www\.w3\.org\/2000\/svg")(\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg")+/g,
      '$1'
    );
    return str;
  }

  function svgToBlob(svgNode, scale) {
    const str = serialize(svgNode);
    const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = PAGE.w * (scale || 2);
        canvas.height = PAGE.h * (scale || 2);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('PNG 编码失败')), 'image/png');
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportPNG(pages, filename) {
    const blobs = [];
    for (const svg of pages) blobs.push(await svgToBlob(svg, 2));
    if (blobs.length === 1) {
      downloadBlob(blobs[0], filename + '.png');
      return;
    }
    // multi-page: zip-less approach - download each page
    for (let i = 0; i < blobs.length; i++) downloadBlob(blobs[i], `${filename}-${i + 1}.png`);
  }

  async function exportPDF(pages, filename, progress) {
    const { jsPDF } = global.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'p' });
    for (let i = 0; i < pages.length; i++) {
      const blob = await svgToBlob(pages[i], 3);
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage('a4', 'p');
      pdf.addImage(dataUrl, 'JPEG', 0, 0, 595.28, 841.89);
      if (progress) progress(i + 1, pages.length);
    }
    pdf.save(filename + '.pdf');
  }

  // Print using a hidden iframe with vector SVG pages (browser "Save as PDF").
  function printPages(pages) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>打印临摹本</title><style>');
    doc.write('@page{size:A4 portrait;margin:0}');
    doc.write('html,body{margin:0;padding:0;background:#fff}');
    doc.write('.sheet-page{display:block;width:210mm;height:297mm;page-break-after:always}');
    doc.write('.sheet-page:last-child{page-break-after:auto}');
    doc.write('</style></head><body>');
    for (const svg of pages) doc.write(serialize(svg));
    doc.write('</body></html>');
    doc.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 30000);
      }, 300);
    };
  }

  global.Sheet = {
    PAGE, GRID, planCells, buildPages, buildPage, svgToBlob,
    exportPNG, exportPDF, printPages, downloadBlob, serialize,
  };
})(window);
