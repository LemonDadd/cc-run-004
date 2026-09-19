// 导出：SVG 页面 → PNG（Canvas）与多页 A4 PDF（jsPDF）。

// 单个 SVG 字符串绘制到 canvas（scale 为像素倍率，2 => 高清）
export async function svgToCanvas(svg, scale = 2) {
  const vb = svg.match(/width="([\d.]+)"\s+height="([\d.]+)"/);
  const w = vb ? parseFloat(vb[1]) : 794;
  const h = vb ? parseFloat(vb[2]) : 1123;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('SVG 栅格化失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadCanvas(canvas, filename, type = 'image/png') {
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, type, 0.95);
}

// 导出单页/多页 PNG（每页一个文件；合并为一张长图可选）
export async function exportPngPages(pages, { scale = 2, name = '临摹本', longImage = false } = {}) {
  const canvases = [];
  for (const svg of pages) canvases.push(await svgToCanvas(svg, scale));
  if (!longImage) {
    canvases.forEach((cv, i) => downloadCanvas(cv, `${name}-${i + 1}.png`));
    return canvases.length;
  }
  // 纵向拼接长图
  const W = canvases[0].width;
  const H = canvases.reduce((a, c) => a + c.height, 0);
  const merged = document.createElement('canvas');
  merged.width = W; merged.height = H;
  const ctx = merged.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  let y = 0;
  for (const c of canvases) { ctx.drawImage(c, 0, y); y += c.height; }
  downloadCanvas(merged, `${name}-长图.png`);
  return 1;
}

// 多页 A4 PDF（每页作为整页位图，无需嵌入中文字体）
export async function exportPdf(pages, { name = '临摹本', scale = 2 } = {}) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const A4W = pdf.internal.pageSize.getWidth();
  const A4H = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const cv = await svgToCanvas(pages[i], scale);
    const url = cv.toDataURL('image/jpeg', 0.92);
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(url, 'JPEG', 0, 0, A4W, A4H);
  }
  pdf.save(name.replace(/\.pdf$/i, '') + '.pdf');
  return pages.length;
}
