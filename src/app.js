// 应用主控：视图切换、动画舞台、临摹本生成与导出、收藏与设置。

import { loadData, getChar, ensureChars, extractHan, uniqueHan } from './data.js';
import { getCharGeom } from './charview.js';
import { strokeOutlinePath } from './geometry.js';
import { gridGuidesSvg } from './grids.js';
import { Player } from './player.js';
import { TEMPLATES, templatePlainText } from './templates.js';
import { buildPages } from './workbook.js';
import { exportPdf, exportPngPages } from './exporter.js';
import {
  loadSettings, saveSettings, dbPut, dbAll, dbDelete,
  exportAll, importAll, downloadJson,
} from './db.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const SVGNS = 'http://www.w3.org/2000/svg';
let settings = null;
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- 视图切换 ----------
$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  tab.classList.add('active');
  $('#view-' + tab.dataset.view).classList.add('active');
  if (tab.dataset.view === 'collections') renderCollections();
}));

// ---------- 动画 ----------
const stageGrid = $('#stageGrid');
const stageOutline = $('#stageOutline');
const stageStrokes = $('#stageStrokes');

function el(name, attrs = {}) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function drawStageGrid(show) {
  stageGrid.innerHTML = show ? gridGuidesSvg('mi', 0, 0, 1024) : '';
}

let animChars = [];   // 当前一批字
let animIdx = 0;
let player = null;

function loadCharForAnim(ch, autoplay) {
  const geom = getCharGeom(ch);
  $('#curChar').textContent = ch;
  stageOutline.innerHTML = '';
  stageStrokes.innerHTML = '';
  drawStageGrid($('#chkGrid').checked);

  if (!geom) {
    $('#strokeCount').textContent = '0';
    $('#strokeLegend').innerHTML = '<span class="muted">该字暂无笔顺数据，仅显示字形</span>';
    const t = el('text', {
      x: 512, y: 720, 'text-anchor': 'middle',
      'font-family': 'KaiTi,STKaiti,serif', 'font-size': 760, fill: '#1a1a1a',
    });
    t.textContent = ch;
    stageStrokes.appendChild(t);
    return;
  }

  $('#strokeCount').textContent = geom.length;
  const types = geom.map(s => s.type);
  renderLegend(types, 0);

  // 淡灰底字
  if ($('#chkOutline').checked) {
    geom.forEach(st => {
      const path = el('path', { d: strokeOutlinePath(st, 1), fill: 'rgba(170,170,170,0.35)' });
      stageOutline.appendChild(path);
    });
  }

  const lengths = geom.map(s => s.total);
  if (player) player.destroy();
  player = new Player({
    strokeLengths: lengths,
    onFrame: state => renderFrame(geom, state, types),
    onEnd: () => { $('#btnPause').textContent = '▶ 重播'; },
  });
  player.setSpeed(settings.speed);
  player.loop = settings.loop;
  player.reset();
  if (autoplay) { player.play(); $('#btnPause').textContent = '⏸ 暂停'; }
}

function renderLegend(types, cur) {
  $('#strokeLegend').innerHTML = types
    .map((t, i) => `<span class="tag ${i === cur ? 'cur' : ''}">${i + 1}.${t}</span>`)
    .join('');
}

function renderFrame(geom, state, types) {
  stageStrokes.innerHTML = '';
  geom.forEach((st, i) => {
    const p = state.progress[i];
    if (p <= 0.001) return;
    const path = el('path', {
      d: strokeOutlinePath(st, p),
      fill: '#111',
    });
    stageStrokes.appendChild(path);
  });
  renderLegend(types, state.strokeIndex);
  // 条目标记
  $$('#charStrip .cell').forEach((c, i) =>
    c.classList.toggle('active', i === animIdx));
}

function setCharStrip(chars) {
  const strip = $('#charStrip');
  strip.innerHTML = '';
  chars.forEach((ch, i) => {
    const c = document.createElement('div');
    c.className = 'cell' + (getChar(ch) ? '' : ' miss');
    c.textContent = ch;
    c.title = getChar(ch) ? '' : '暂无笔顺数据';
    c.addEventListener('click', () => { animIdx = i; loadCharForAnim(ch, true); });
    strip.appendChild(c);
  });
}

function applyAnimInput(text, autoplay = true) {
  const chars = extractHan(text);
  animChars = chars;
  setCharStrip(chars);
  if (chars.length) { animIdx = 0; loadCharForAnim(chars[0], autoplay); }
}

$('#charInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') applyAnimInput(e.target.value);
});
$('#btnPlay').addEventListener('click', () => {
  const text = $('#charInput').value.trim();
  if (text) applyAnimInput(text);
  else if (animChars.length) loadCharForAnim(animChars[animIdx] || animChars[0], true);
});

$('#btnPause').addEventListener('click', () => {
  if (!player) return;
  player.toggle();
  $('#btnPause').textContent = player.playing ? '⏸ 暂停' : '▶ 播放';
});
$('#btnPrev').addEventListener('click', () => { if (player) { player.prev(); $('#btnPause').textContent = '▶ 播放'; } });
$('#btnNext').addEventListener('click', () => { if (player) { player.next(); $('#btnPause').textContent = '▶ 播放'; } });
$('#chkLoop').addEventListener('change', e => {
  settings.loop = e.target.checked; saveSettings({ loop: e.target.checked });
  if (player) player.setLoop(e.target.checked);
});
$('#speedRange').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  settings.speed = v; saveSettings({ speed: v });
  $('#speedVal').textContent = v + '×';
  if (player) player.setSpeed(v);
});
$('#chkOutline').addEventListener('change', () => loadCharForAnim(animChars[animIdx], false));
$('#chkGrid').addEventListener('change', e => drawStageGrid(e.target.checked));

// 模板
$$('[data-tpl]').forEach(btn => btn.addEventListener('click', () => {
  const t = TEMPLATES.find(x => x.id === btn.dataset.tpl);
  const plain = templatePlainText(t);
  $('#charInput').value = plain.slice(0, 60);
  $('#tplHint').textContent = `${t.name}共 ${plain.length} 字，已载入前 60 字（可在“临摹本”生成全文）`;
  applyAnimInput(plain.slice(0, 60));
}));

// ---------- 临摹本 ----------
let wbPages = [];
let wbPageIdx = 0;
let wbChars = [];

function wbOptions() {
  return {
    grid: $('#optGrid').value,
    mode: $('#optMode').value,
    traceCount: parseInt($('#optTraceCount').value, 10),
    blankCount: parseInt($('#optBlankCount').value, 10),
    traceOpacity: parseInt($('#optOpacity').value, 10) / 100,
    cols: parseInt($('#optCols').value, 10),
    rows: parseInt($('#optRows').value, 10),
    smallGuide: true,
    title: '汉字笔顺临摹本',
  };
}

async function generateWorkbook() {
  const text = $('#wbText').value;
  const chars = uniqueHan(text);
  wbChars = chars;
  if (!chars.length) { toast('请先输入汉字'); return null; }
  const status = $('#genStatus');
  status.textContent = '加载笔顺数据…';
  const t0 = performance.now();
  const have = await ensureChars(chars);
  const opt = wbOptions();
  wbPages = buildPages(chars, opt);
  wbPageIdx = 0;
  const ms = Math.round(performance.now() - t0);
  status.textContent = `${chars.length} 字 → ${wbPages.length} 页，用时 ${ms} ms（笔顺库覆盖 ${have}/${chars.length} 字）`;
  renderWbPage();
  return opt;
}

function renderWbPage() {
  const host = $('#pagePreview');
  host.innerHTML = '';
  // 屏幕预览只渲染当前页（多页 PDF/打印时再全部渲染）
  const wrap = document.createElement('div');
  wrap.className = 'sheet';
  wrap.innerHTML = wbPages[wbPageIdx];
  host.appendChild(wrap);
  $('#pager').hidden = wbPages.length <= 1;
  $('#pgInfo').textContent = `${wbPageIdx + 1} / ${wbPages.length}`;
}
$('#pgPrev').addEventListener('click', () => { if (wbPageIdx > 0) { wbPageIdx--; renderWbPage(); } });
$('#pgNext').addEventListener('click', () => { if (wbPageIdx < wbPages.length - 1) { wbPageIdx++; renderWbPage(); } });

$('#btnGenerate').addEventListener('click', generateWorkbook);

// 控件联动
function syncOptVisibility() {
  const mode = $('#optMode').value;
  $('#grpTrace').style.display = mode === 'demo' ? '' : 'none';
  $('#grpBlank').style.display = mode === 'demo' ? '' : 'none';
  $('#grpOpacity').style.display = mode === 'blank' ? 'none' : '';
}
$('#optMode').addEventListener('change', syncOptVisibility);
$('#optTraceCount').addEventListener('input', e => $('#traceCountVal').textContent = e.target.value);
$('#optBlankCount').addEventListener('input', e => $('#blankCountVal').textContent = e.target.value);
$('#optOpacity').addEventListener('input', e => $('#opacityVal').textContent = e.target.value + '%');

$$('[data-wbtpl]').forEach(btn => btn.addEventListener('click', async () => {
  const t = TEMPLATES.find(x => x.id === btn.dataset.wbtpl);
  const plain = templatePlainText(t);
  $('#wbText').value = plain;
  updateWbCount();
  await generateWorkbook();
}));
$('#wbText').addEventListener('input', updateWbCount);
function updateWbCount() {
  const n = uniqueHan($('#wbText').value).length;
  $('#wbCount').textContent = n ? `去重 ${n} 字` : '';
}

// 打印（浏览器原生，可另存 PDF）
$('#btnPrint').addEventListener('click', async () => {
  if (!wbPages.length) await generateWorkbook();
  if (!wbPages.length) return;
  const root = $('#printRoot');
  root.innerHTML = wbPages.map(s => `<div class="sheet">${s}</div>`).join('');
  // 等一帧让 SVG 布局
  requestAnimationFrame(() => setTimeout(() => window.print(), 60));
});

// 导出 PDF
$('#btnExportPdf').addEventListener('click', async () => {
  if (!wbPages.length) await generateWorkbook();
  if (!wbPages.length) return;
  toast('正在生成 PDF…');
  try {
    const n = await exportPdf(wbPages, { name: '汉字临摹本', scale: 2 });
    toast(`PDF 已导出（${n} 页）`);
  } catch (err) { toast('PDF 导出失败：' + err.message); }
});

// 导出 PNG
$('#btnExportPng').addEventListener('click', async () => {
  if (!wbPages.length) await generateWorkbook();
  if (!wbPages.length) return;
  toast('正在导出 PNG…');
  try {
    const n = await exportPngPages(wbPages, { scale: 2, name: '汉字临摹本', longImage: false });
    toast(`已导出 ${n} 张 PNG`);
  } catch (err) { toast('PNG 导出失败：' + err.message); }
});

// 存入字帖
$('#btnSaveCollection').addEventListener('click', async () => {
  if (!wbChars.length) { toast('请先生成字帖'); return; }
  const name = prompt('字帖名称：', `字帖 ${new Date().toLocaleDateString('zh-CN')}`);
  if (!name) return;
  const id = 'c' + Date.now();
  await dbPut('collections', {
    id, name,
    chars: Array.from(new Set(wbChars)),
    options: wbOptions(),
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  toast('已存入「我的字帖」');
});

// ---------- 收藏列表 ----------
async function renderCollections() {
  const list = $('#collectionList');
  const items = (await dbAll('collections')).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!items.length) {
    list.innerHTML = '<div class="empty">还没有收藏的字帖。在“生成临摹本”里点击「存入字帖」即可保存。</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(it => {
    const card = document.createElement('div');
    card.className = 'coll-card';
    const preview = it.chars.slice(0, 24).join('');
    card.innerHTML = `
      <h3></h3>
      <div class="preview-chars"></div>
      <div class="meta">${it.chars.length} 字 · ${new Date(it.updatedAt).toLocaleString('zh-CN')}</div>
      <div class="ops">
        <button class="use">生成字帖</button>
        <button class="anim">看笔顺</button>
        <button class="del">删除</button>
      </div>`;
    card.querySelector('h3').textContent = it.name;
    card.querySelector('.preview-chars').textContent = preview;
    card.querySelector('.use').addEventListener('click', () => {
      $('#wbText').value = it.chars.join('');
      if (it.options) {
        $('#optGrid').value = it.options.grid || 'tian';
        $('#optMode').value = it.options.mode || 'demo';
      }
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      document.querySelector('[data-view=workbook]').classList.add('active');
      $('#view-workbook').classList.add('active');
      syncOptVisibility(); updateWbCount(); generateWorkbook();
    });
    card.querySelector('.anim').addEventListener('click', () => {
      $('#charInput').value = it.chars.slice(0, 20).join('');
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      document.querySelector('[data-view=animate]').classList.add('active');
      $('#view-animate').classList.add('active');
      applyAnimInput(it.chars.slice(0, 20).join(''));
    });
    card.querySelector('.del').addEventListener('click', async () => {
      if (confirm(`删除字帖「${it.name}」？`)) { await dbDelete('collections', it.id); renderCollections(); }
    });
    list.appendChild(card);
  });
}

// 数据导入导出
$('#btnExportData').addEventListener('click', async () => {
  const data = await exportAll();
  downloadJson(data, `汉字临摹本数据-${new Date().toISOString().slice(0, 10)}.json`);
  toast('数据已导出');
});
$('#btnImportData').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await importAll(data, { merge: confirm('合并到现有数据？\n确定＝合并，取消＝覆盖现有数据') });
    toast('导入完成'); renderCollections();
  } catch (err) { toast('导入失败：' + err.message); }
  e.target.value = '';
});

// ---------- 初始化 ----------
(async function init() {
  settings = await loadSettings();
  $('#speedRange').value = settings.speed;
  $('#speedVal').textContent = settings.speed + '×';
  $('#chkLoop').checked = !!settings.loop;
  $('#chkOutline').checked = true;
  $('#chkGrid').checked = true;
  syncOptVisibility();
  try {
    await loadData();
  } catch (err) {
    toast('笔顺数据加载失败，请检查 data/strokes.json');
  }
  $('#charInput').value = '永字八法';
  applyAnimInput('永字八法', true);
})();

// 注册 Service Worker（离线可用）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
