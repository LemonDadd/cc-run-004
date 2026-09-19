// Integration tests run under Node with jsdom + fake-indexeddb.
// Covers: stroke decode, classifier, sheet SVG layout, DB persistence.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/workspace/tools/node_modules/jsdom');

const WEB = '/workspace/app/web';

// ---- fake DOM environment ----
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.performance = dom.window.performance;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.XMLSerializer = dom.window.XMLSerializer;
global.Image = dom.window.Image;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;

// fake fetch serving local files
global.fetch = (url) => {
  let p = String(url).replace('http://localhost/', '');
  if (p.startsWith('data/')) p = path.join(WEB, p);
  const body = fs.readFileSync(p, 'utf8');
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) });
};

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

async function main() {
  const loadApp = (rel) => {
    require(path.join(WEB, rel));
    // IIFEs attach to dom window; expose on global for bare-identifier lookup
    for (const k of ['StrokeData', 'Animator', 'Sheet', 'DB']) {
      if (dom.window[k] && !global[k]) global[k] = dom.window[k];
    }
  };
  loadApp('js/data.js');
  const StrokeData = dom.window.StrokeData;

  // ---- data layer ----
  console.log('data layer:');
  const yong = await StrokeData.loadChar('永');
  check('永 has 5 strokes', yong.length === 5);
  check('stroke has segments + median', yong[0].segments.length > 0 && yong[0].median.length > 2);
  check('types are 6-category', yong.every((s) => '横竖撇捺点折'.includes(s.type)));
  check('永 types = 点折折撇捺', yong.map((s) => s.type).join('') === '点折折撇捺', yong.map((s) => s.type).join(''));
  const d = StrokeData.toPathD(yong[0].segments);
  check('path d starts with M', d.startsWith('M'));

  // batch load timing: 100 common GB2312 chars
  const gb = fs.readFileSync('/workspace/tools/gb2312.txt', 'utf8').split('\n')[0];
  const chars100 = [...gb].slice(0, 100);
  const t0 = process.hrtime.bigint();
  const results = await Promise.all(chars100.map((c) => StrokeData.loadChar(c)));
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  check('100 chars all resolved', results.every(Boolean));
  check('100 chars load < 2000ms', ms < 2000, ms.toFixed(0) + 'ms');

  // ---- animator builds SVG ----
  console.log('animator:');
  loadApp('js/animator.js');
  const scene = Animator.buildSvg(yong, {});
  check('svg element created', scene.svg.tagName && scene.svg.tagName.toLowerCase() === 'svg');
  check('5 outline + 5 draw paths', scene.outlineNodes.length === 5 && scene.drawNodes.length === 5);
  check('draw groups have vertical flip', /matrix/.test(scene.drawG.getAttribute('transform')));

  // player step control
  const p = new Animator.Player(scene, { strokeMs: 100 });
  p.setSpeed(1);
  check('progress starts 0', p.progress === 0);
  p.stepForward();
  check('stepForward -> 1 stroke', p.progress === 1);
  check('first stroke fully drawn', scene.drawNodes[0].style.strokeDashoffset === '0');
  p.stepBack();
  check('stepBack -> 0', p.progress === 0);
  p.setProgress(5);
  check('all strokes drawn at end', scene.drawNodes.every((n) => n.style.strokeDashoffset === '0'));
  p.destroy();

  // ---- sheet layout ----
  console.log('sheet:');
  loadApp('js/sheet.js');
  const strokesMap = {};
  for (const c of chars100.slice(0, 100)) strokesMap[c] = StrokeData.getCached(c);
  const t2 = process.hrtime.bigint();
  const pages = Sheet.buildPages(chars100, strokesMap, {
    trace: true, blanks: 2, grid: 'tian', traceGrid: 'mi',
    traceOpacity: 0.28, cellSize: 112, showPinyin: false,
    title: '测试', subtitle: 'x', gap: 6, charPad: 0.07,
  }, {});
  const t3 = process.hrtime.bigint();
  const layoutMs = Number(t3 - t2) / 1e6;
  check('100 chars laid out to pages', pages.length >= 1);
  check('layout 100 chars < 500ms', layoutMs < 500, layoutMs.toFixed(0) + 'ms');
  const cellRects = pages[0].querySelectorAll('rect').length;
  check('first page contains grid rects', cellRects > 10, cellRects + ' rects');
  const traced = pages[0].querySelectorAll('path').length;
  check('first page has traced glyph paths', traced > 0, traced + ' paths');
  const xml = new XMLSerializer().serializeToString(pages[0]);
  check('serialized svg is valid', xml.includes('<svg') && xml.includes('</svg>'));
  check('page is A4 ratio', Math.abs(794 / 1123 - pages[0].getAttribute('width') / pages[0].getAttribute('height')) < 0.01);

  // blank-only mode
  const pagesBlank = Sheet.buildPages(['永'], { '永': yong }, {
    trace: false, blanks: 3, grid: 'mi', cellSize: 112, gap: 6, charPad: 0.07,
  }, {});
  check('blank mode yields 4 cells (1+3)', pagesBlank[0].querySelectorAll('rect').length >= 5);

  // ---- DB (fake-indexeddb) ----
  console.log('storage:');
  require('/workspace/tools/node_modules/fake-indexeddb/auto');
  global.indexedDB = global.window.indexedDB;
  loadApp('js/db.js');
  await DB.put('favorites', { id: 'main', chars: ['永'], copybooks: [] });
  const row = await DB.get('favorites', 'main');
  check('favorites round-trip', row.chars[0] === '永');
  await DB.setSetting('speed', 1.5);
  const settings = await DB.loadSettings();
  check('settings round-trip', settings.speed === 1.5);

  // JSON export structure
  const backup = { app: 'hanzi-tieben', favorites: row, settings };
  check('backup JSON is serializable', JSON.stringify(backup).length > 20);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
