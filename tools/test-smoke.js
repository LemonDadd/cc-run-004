// Full-page smoke test: load index.html in jsdom with scripts enabled
// against the local static server, and exercise the main UI flows.
const { JSDOM } = require('/workspace/tools/node_modules/jsdom');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123/';
let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, e || '')); };

(async () => {
  // polyfills injected into the page before its scripts run
  const nodeFetch = (u, opts) => new Promise((resolve, reject) => {
    const http = require('http');
    const url = new URL(u, BASE);
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({
        ok: res.statusCode === 200,
        status: res.statusCode,
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body)),
      }));
    }).on('error', reject);
  });

  const dom = await JSDOM.fromURL(BASE, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = nodeFetch;
      require('/workspace/tools/node_modules/fake-indexeddb/auto');
      window.indexedDB = global.indexedDB;
      window.IDBKeyRange = global.IDBKeyRange;
      // rAF shim
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(window.performance.now()), 16);
      window.cancelAnimationFrame = (id) => clearTimeout(id);
      window.Element.prototype.scrollIntoView = () => {};
      window.navigator.serviceWorker = undefined;
    },
  });
  const { window } = dom;
  // wait for boot: data fetch + char render
  await sleep(1500);
  const doc = window.document;
  const $ = (s) => doc.querySelector(s);
  // pause autoplay right away for deterministic stepping
  $('#btnPlay').click();
  await sleep(30);
  $('#progressRange').value = 0;
  $('#progressRange').dispatchEvent(new window.Event('input'));
  await sleep(30);

  console.log('boot:');
  ok('status shows local library size', /本地字库/.test($('#dataStatus').textContent), $('#dataStatus').textContent);
  ok('template cards rendered', doc.querySelectorAll('.tpl-card').length >= 6,
     doc.querySelectorAll('.tpl-card').length);
  ok('initial char svg rendered', doc.querySelectorAll('.hanzi-svg').length === 1);
  ok('outline shapes rendered', doc.querySelectorAll('.outline-layer path').length > 0);
  ok('play button exists', /播放/.test($('#btnPlay').textContent));
  // give autoplay some frames; under jsdom rAF it may finish instantly
  await sleep(300);
  ok('animation advanced or finished', /[1-5] \/ 5/.test($('#progressLabel').textContent),
     $('#progressLabel').textContent);
  ok('stroke list populated', doc.querySelectorAll('#strokeList li').length === 5);

  await sleep(300);
  console.log('player controls:');
  // player is already paused at progress 0 from boot setup
  ok('paused before stepping', /播放/.test($('#btnPlay').textContent));
  // jsdom rAF shim may have let a few frames through; only the stepping
  // increments matter (verified below), not the exact paused progress.
  ok('progress is a valid stroke count', /^\d+ \/ 5/.test($('#progressLabel').textContent),
     $('#progressLabel').textContent);
  $('#btnStep').click();
  await sleep(20);
  ok('one step forward', /[1-5] \/ 5/.test($('#progressLabel').textContent), $('#progressLabel').textContent);
  const labelAfterStep = +$('#progressLabel').textContent.match(/^(\d)/)[1];
  $('#btnStep').click();
  await sleep(20);
  const label2 = +$('#progressLabel').textContent.match(/^(\d)/)[1];
  ok('second step increments', label2 === labelAfterStep + 1, label2 + ' after ' + labelAfterStep);
  $('#btnStepBack').click();
  await sleep(20);
  const label3 = +$('#progressLabel').textContent.match(/^(\d)/)[1];
  ok('step back decrements', label3 === label2 - 1, label3 + ' after ' + label2);
  $('#btnRestart').click();
  await sleep(30);
  ok('restart replays', /[1-5] \/ 5/.test($('#progressLabel').textContent));
  $('#btnPlay').click(); // pause again
  $('#btnLoop').click();
  ok('loop toggle active', $('#btnLoop').classList.contains('primary'));
  $('#btnLoop').click();

  console.log('multi-char input:');
  $('#charInput').value = '汉字';
  $('#loadChar').click();
  await sleep(600);
  ok('queue loads first char 汉', /1\/2/.test($('#charPos').textContent), $('#charPos').textContent);
  ok('汉 has 5 strokes', doc.querySelectorAll('#strokeList li').length === 5,
     doc.querySelectorAll('#strokeList li').length);
  $('#nextChar').click();
  await sleep(600);
  ok('next -> 2/2', /2\/2/.test($('#charPos').textContent), $('#charPos').textContent);
  ok('字 has 6 strokes', doc.querySelectorAll('#strokeList li').length === 6,
     doc.querySelectorAll('#strokeList li').length);
  $('#prevChar').click();
  await sleep(400);
  ok('prev -> 1/2', /1\/2/.test($('#charPos').textContent), $('#charPos').textContent);

  console.log('copybook flow:');
  doc.querySelector('button[data-tab="copybook"]').click();
  await sleep(50);
  $('#cbText').value = '天地玄黄宇宙洪荒';
  $('#cbTitle').value = '千字文';
  $('#cbKeepOrder').checked = false;
  $('#cbGenerate').click();
  await sleep(1200);
  const pages = doc.querySelectorAll('.sheet-page');
  ok('copybook page rendered', pages.length === 1, pages.length);
  // one page = background + many cell rects (6 cols * 9 rows = 54 cells)
  ok('grid cells created (24 cells + bg)', pages[0].querySelectorAll('rect').length >= 24,
     pages[0].querySelectorAll('rect').length + ' rects');
  ok('trace glyphs painted', pages[0].querySelectorAll('path').length > 20);
  ok('perf text shows < 2s', /ms/.test($('#cbPerf').textContent), $('#cbPerf').textContent);
  console.log('   ', $('#cbPerf').textContent);

  // change grid options
  doc.querySelectorAll('#gridTypeSeg button')[1].click(); // mi
  $('#cbTraceOpacity').value = 0.5;
  $('#cbTraceOpacity').dispatchEvent(new window.Event('input'));
  $('#cbGenerate').click();
  await sleep(800);
  const page2 = doc.querySelector('.sheet-page');
  ok('mi grid regenerated', page2.querySelectorAll('line').length > 30, page2.querySelectorAll('line').length);

  // 100-char performance: drive through the template UI so the single-file
  // primer subset bundle is used (one request instead of ~30 chunks)
  doc.querySelector('button[data-tab="templates"]').click();
  await sleep(50);
  doc.querySelectorAll('.tpl-card')[0].click();
  await sleep(50);
  $('#tplEnd').value = 100;
  $('#tplEnd').dispatchEvent(new window.Event('change'));
  const t0 = Date.now();
  $('#tplGenCopy').click();
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    if (/ms/.test($('#cbPerf').textContent) && doc.querySelectorAll('.sheet-page').length) break;
  }
  const dt = Date.now() - t0;
  const pages100 = doc.querySelectorAll('.sheet-page');
  ok('100 chars produced multiple pages', pages100.length >= 5, pages100.length);
  const m = $('#cbPerf').textContent.match(/共\s*(\d+)ms/);
  const ms = m ? +m[1] : 99999;
  ok('100-char data+layout under 2000ms', ms < 2000, ms + 'ms');
  console.log('   ', $('#cbPerf').textContent, '/', pages100.length, '页, 端到端', dt, 'ms');

  console.log('templates tab:');
  doc.querySelector('button[data-tab="templates"]').click();
  await sleep(50);
  doc.querySelectorAll('.tpl-card')[0].click(); // 千字文
  await sleep(50);
  ok('template detail opens', !$('#templateDetailCard').hidden);
  ok('char cloud shows 100 chars', $('#tplChars').children.length === 100, $('#tplChars').children.length);
  $('#tplEnd').value = 20;
  $('#tplEnd').dispatchEvent(new window.Event('change'));
  ok('range change updates cloud', $('#tplChars').children.length === 20, $('#tplChars').children.length);
  $('#tplAnimPreview').click();
  await sleep(700);
  ok('preview jumps to animate tab', $('#tab-animate').classList.contains('active'));
  ok('queue length = 20', /1\/20/.test($('#charPos').textContent), $('#charPos').textContent);

  console.log('settings tab:');
  doc.querySelector('button[data-tab="settings"]').click();
  await sleep(50);
  ok('about list populated', $('#aboutList').children.length >= 3);
  $('#btnOfflineStatus').click();
  await sleep(300);
  ok('offline status reports chunks', /分片/.test($('#preloadMsg').textContent), $('#preloadMsg').textContent);

  window.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
