// app.js - UI wiring for the hanzi stroke-order / copybook app
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    queue: ['永'],
    qi: 0,
    strokes: null,
    player: null,
    scene: null,
    templates: null,
    sequences: null,
    pinyin: {},
    currentTpl: null,
    pages: [],
    usePrimerBundle: false,
    favorites: { chars: [], copybooks: [] },
    settings: {
      speed: 1,
      loop: false,
      outline: true,
      outlineOpacity: 0.16,
      showMedian: false,
      grid: 'tian',
      trace: true,
      traceGrid: 'tian',
      traceOpacity: 0.28,
      blanks: 2,
      cellSize: 112,
      pinyinOn: false,
    },
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2200);
  }

  const isHan = (c) => /[㐀-䶿一-鿿豈-﫿]/.test(c);
  const unique = (s) => [...new Set([...s].filter(isHan))];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- tabs ----------
  function initTabs() {
    $('#tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      $$('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      $('#tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'mine') renderMine();
    });
  }

  // =====================================================================
  //  Animation tab
  // =====================================================================
  function showStageHint(text) {
    const h = $('#stageHint');
    if (text) { h.textContent = text; h.classList.remove('hidden'); }
    else h.classList.add('hidden');
  }

  async function loadCurrentChar() {
    const ch = state.queue[state.qi];
    const list = $('#strokeList');
    if (!ch) {
      $('#charPos').textContent = '0/0';
      $('#prevChar').disabled = true;
      $('#nextChar').disabled = true;
      $('#animStage').innerHTML = '';
      $('#charPinyin').textContent = '';
      showStageHint('请输入汉字');
      list.innerHTML = '';
      $('#strokeCount').textContent = '';
      $('#progressLabel').textContent = '0 / 0 笔';
      if (state.player) { state.player.destroy(); state.player = null; }
      return;
    }
    $('#charPos').textContent = `${state.qi + 1}/${state.queue.length}`;
    $('#prevChar').disabled = state.qi === 0;
    $('#nextChar').disabled = state.qi === state.queue.length - 1;
    showStageHint('加载中…');
    const strokes = await StrokeData.loadChar(ch);
    // user may have navigated away meanwhile
    if (state.queue[state.qi] !== ch) return;
    state.strokes = strokes;
    renderStage(ch, strokes);
  }

  function renderStage(ch, strokes) {
    const stage = $('#animStage');
    stage.innerHTML = '';
    $('#charPinyin').textContent = state.pinyin[ch] || '';
    updateFavButton(ch);
    if (!strokes) {
      showStageHint('「' + ch + '」暂无笔顺数据');
      $('#strokeList').innerHTML = '';
      $('#strokeCount').textContent = '';
      $('#progressLabel').textContent = '0 / 0 笔';
      $('#progressRange').max = 1;
      return;
    }
    showStageHint(null);
    const scene = Animator.buildSvg(strokes, {
      outlineOpacity: state.settings.outline ? state.settings.outlineOpacity : 0,
    });
    state.scene = scene;
    stage.appendChild(scene.svg);
    applyMedianVisibility();

    if (state.player) state.player.destroy();
    const player = new Animator.Player(scene, {
      strokeMs: 900,
      loop: state.settings.loop,
      onChange: onPlayerChange,
    });
    player.setSpeed(state.settings.speed);
    state.player = player;
    player.play();

    // stroke list
    $('#strokeCount').textContent = `${strokes.length} 笔`;
    const list = $('#strokeList');
    list.innerHTML = '';
    strokes.forEach((s, i) => {
      const li = document.createElement('li');
      li.dataset.i = i;
      li.innerHTML =
        `<span class="idx">${i + 1}</span>` +
        `<span class="dot" style="background:${StrokeData.STROKE_COLORS[s.type]}"></span>` +
        `<span class="name">${s.type}</span>`;
      li.addEventListener('click', () => { player.pause(); player.setProgress(i + 1); });
      list.appendChild(li);
    });

    const r = $('#progressRange');
    r.max = strokes.length;
    r.value = 0;
  }

  function onPlayerChange() {
    const p = state.player;
    if (!p) return;
    $('#btnPlay').textContent = p.playing ? '⏸ 暂停' : '▶ 播放';
    $('#progressRange').value = p.progress;
    const shown = p.playing ? Math.min(Math.floor(p.progress) + 1, p.count) : Math.round(p.progress);
    $('#progressLabel').textContent = `${shown} / ${p.count} 笔`;
    $$('#strokeList li').forEach((li) => {
      const i = +li.dataset.i;
      li.classList.toggle('active', p.progress >= i + 1);
    });
  }

  function applyMedianVisibility() {
    if (!state.scene) return;
    state.scene.guideG.style.display = state.settings.showMedian ? '' : 'none';
  }

  function updateFavButton(ch) {
    const fav = state.favorites.chars.includes(ch);
    $('#favBtn').textContent = fav ? '★ 已收藏' : '☆ 收藏';
  }

  function initAnimTab() {
    $('#loadChar').addEventListener('click', () => {
      const chars = unique($('#charInput').value);
      if (!chars.length) {
        toast('请输入汉字');
        state.queue = [];
        state.qi = 0;
        loadCurrentChar();
        return;
      }
      state.queue = chars;
      state.qi = 0;
      loadCurrentChar();
    });
    $('#charInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#loadChar').click();
    });
    $('#prevChar').addEventListener('click', () => {
      if (state.qi > 0) { state.qi--; loadCurrentChar(); }
    });
    $('#nextChar').addEventListener('click', () => {
      if (state.qi < state.queue.length - 1) { state.qi++; loadCurrentChar(); }
    });

    $('#btnPlay').addEventListener('click', () => state.player && state.player.toggle());
    $('#btnRestart').addEventListener('click', () => {
      if (!state.player) return;
      state.player.reset();
      state.player.play();
    });
    $('#btnStep').addEventListener('click', () => state.player && state.player.stepForward());
    $('#btnStepBack').addEventListener('click', () => state.player && state.player.stepBack());
    $('#btnLoop').addEventListener('click', () => {
      state.settings.loop = !state.settings.loop;
      if (state.player) state.player.loop = state.settings.loop;
      $('#btnLoop').classList.toggle('primary', state.settings.loop);
      saveSettings();
    });

    const speed = $('#speedRange');
    speed.addEventListener('input', () => {
      const v = +speed.value;
      state.settings.speed = v;
      if (state.player) state.player.setSpeed(v);
      $('#speedVal').textContent = v + '×';
      saveSettings();
    });

    $('#progressRange').addEventListener('input', (e) => {
      if (state.player) { state.player.pause(); state.player.setProgress(+e.target.value); }
    });

    $('#optOutline').addEventListener('change', (e) => {
      state.settings.outline = e.target.checked;
      if (state.strokes) renderStage(state.queue[state.qi], state.strokes);
      saveSettings();
    });
    $('#optOutlineOpacity').addEventListener('input', (e) => {
      state.settings.outlineOpacity = +e.target.value;
      if (state.settings.outline && state.strokes) {
        state.scene.outlineNodes.forEach((n) => n.setAttribute('fill-opacity', state.settings.outlineOpacity));
      }
      saveSettings();
    });
    $('#optMedian').addEventListener('change', (e) => {
      state.settings.showMedian = e.target.checked;
      applyMedianVisibility();
      saveSettings();
    });

    $('#favBtn').addEventListener('click', async () => {
      const ch = state.queue[state.qi];
      if (!ch) return;
      const set = new Set(state.favorites.chars);
      if (set.has(ch)) { set.delete(ch); toast('已取消收藏'); }
      else { set.add(ch); toast('已收藏「' + ch + '」'); }
      state.favorites.chars = [...set];
      await DB.put('favorites', { id: 'main', ...state.favorites });
      updateFavButton(ch);
    });

    $('#exportCharPng').addEventListener('click', exportCurrentCharPng);
    $('#sendToCopybook').addEventListener('click', () => {
      const ch = state.queue[state.qi];
      $('#cbText').value = ch;
      $('#cbKeepOrder').checked = false;
      state.usePrimerBundle = false;
      switchTab('copybook');
      updateCbCount();
      generateCopybook();
    });
  }

  function switchTab(name) {
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-panel').forEach((p) => p.classList.remove('active'));
    $('#tab-' + name).classList.add('active');
  }

  async function exportCurrentCharPng() {
    const ch = state.queue[state.qi];
    if (!state.strokes) return;
    // standalone SVG without backdrop grid
    const scene = Animator.buildSvg(state.strokes, { outlineOpacity: 0.12 });
    scene.svg.setAttribute('width', 1024);
    scene.svg.setAttribute('height', 1024);
    const bg = document.createElementNS(Animator.NS, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', 1024); bg.setAttribute('height', 1024);
    bg.setAttribute('fill', '#ffffff');
    scene.svg.insertBefore(bg, scene.svg.firstChild);
    const blob = await new Promise((resolve, reject) => {
      const str = Sheet.serialize(scene.svg);
      const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 1024;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob((b) => b ? resolve(b) : reject(new Error('PNG 编码失败')), 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
    Sheet.downloadBlob(blob, 'hanzi-' + ch + '.png');
  }

  // =====================================================================
  //  Templates tab
  // =====================================================================
  function renderTemplateGrid() {
    const grid = $('#templateGrid');
    grid.innerHTML = '';
    state.templates.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'tpl-card';
      card.innerHTML = `<h3>${t.name}</h3><p>${t.desc}</p><div class="preview">${t.chars.slice(0, 18).join('')}</div>`;
      card.addEventListener('click', () => openTemplate(t));
      grid.appendChild(card);
    });
  }

  function tplChars() {
    const t = state.currentTpl;
    return (state.sequences && state.sequences[t.id]) || t.chars;
  }

  function openTemplate(t) {
    state.currentTpl = t;
    $('#templateDetailCard').hidden = false;
    $('#tplTitle').textContent = t.name;
    $('#tplDesc').textContent = t.desc;
    const chars = tplChars();
    $('#tplTotal').textContent = `共 ${chars.length} 字（按原文顺序）`;
    $('#tplStart').max = chars.length;
    $('#tplEnd').max = chars.length;
    $('#tplStart').value = 1;
    $('#tplEnd').value = Math.min(100, chars.length);
    renderTplChars();
    $('#tplFav').textContent = isTplFav(t.id) ? '★ 已收藏' : '☆ 收藏此帖';
    const card = $('#templateDetailCard');
    if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderTplChars() {
    const chars = tplChars();
    let a = Math.max(1, +$('#tplStart').value);
    let b = Math.min(chars.length, +$('#tplEnd').value);
    if (b - a > 300) b = a + 300; // cap rendered preview buttons
    const cloud = $('#tplChars');
    cloud.innerHTML = '';
    for (let i = a - 1; i < b; i++) {
      const ch = chars[i];
      const btn = document.createElement('button');
      btn.textContent = ch;
      btn.title = state.pinyin[ch] || '';
      btn.addEventListener('click', () => {
        switchTab('animate');
        $('#charInput').value = ch;
        state.queue = [ch]; state.qi = 0;
        loadCurrentChar();
      });
      cloud.appendChild(btn);
    }
  }

  function selectedTplChars() {
    const chars = tplChars();
    const a = Math.max(1, +$('#tplStart').value) - 1;
    const b = Math.min(chars.length, +$('#tplEnd').value);
    return chars.slice(a, b);
  }

  function isTplFav(id) {
    return state.favorites.copybooks.some((c) => c.sourceId === 'tpl:' + id);
  }

  function initTemplateTab() {
    $('#tplStart').addEventListener('change', renderTplChars);
    $('#tplEnd').addEventListener('change', renderTplChars);

    $('#tplAnimPreview').addEventListener('click', () => {
      const chars = selectedTplChars();
      switchTab('animate');
      $('#charInput').value = chars.join('');
      state.queue = chars; state.qi = 0;
      loadCurrentChar();
    });

    $('#tplGenCopy').addEventListener('click', () => {
      const chars = selectedTplChars();
      $('#cbText').value = chars.join('');
      $('#cbKeepOrder').checked = true;
      state.settings.keepOrder = true;
      state.usePrimerBundle = true;
      if (!$('#cbTitle').value.trim()) $('#cbTitle').value = state.currentTpl.name;
      switchTab('copybook');
      updateCbCount();
      generateCopybook();
    });

    $('#tplFav').addEventListener('click', async () => {
      const t = state.currentTpl;
      const sid = 'tpl:' + t.id;
      const existing = state.favorites.copybooks.find((c) => c.sourceId === sid);
      if (existing) {
        state.favorites.copybooks = state.favorites.copybooks.filter((c) => c.sourceId !== sid);
        toast('已取消收藏');
      } else {
        state.favorites.copybooks.push({
          id: DB.uid(), sourceId: sid, name: t.name,
          text: t.chars.join(''), savedAt: Date.now(),
        });
        toast('已收藏《' + t.name + '》');
      }
      await DB.put('favorites', { id: 'main', ...state.favorites });
      $('#tplFav').textContent = isTplFav(t.id) ? '★ 已收藏' : '☆ 收藏此帖';
    });

    $('#customDedup').addEventListener('click', () => {
      const chars = unique($('#customText').value);
      $('#cbText').value = chars.join('');
      $('#cbKeepOrder').checked = false;
      state.usePrimerBundle = false;
      switchTab('copybook');
      updateCbCount();
      generateCopybook();
    });
    $('#customSeq').addEventListener('click', () => {
      const chars = [...$('#customText').value].filter(isHan);
      $('#cbText').value = chars.join('');
      $('#cbKeepOrder').checked = true;
      state.usePrimerBundle = false;
      switchTab('copybook');
      updateCbCount();
      generateCopybook();
    });
  }

  // =====================================================================
  //  Copybook tab
  // =====================================================================
  function updateCbCount() {
    const chars = [...$('#cbText').value].filter(isHan);
    $('#cbCharCount').textContent = chars.length;
  }

  function readCbOptions() {
    const s = state.settings;
    return {
      pattern: s.trace ? 'traceN' : 'blank',
      trace: s.trace,
      blanks: +$('#cbBlanks').value,
      copies: 1,
      grid: s.grid,
      traceGrid: s.traceGrid,
      traceOpacity: s.traceOpacity,
      cellSize: +$('#cbCellSize').value,
      showPinyin: s.pinyinOn,
      title: $('#cbTitle').value.trim(),
      subtitle: '汉字笔顺临摹本',
      gap: 6,
      charPad: 0.07,
    };
  }

  async function generateCopybook() {
    const keepOrder = $('#cbKeepOrder').checked;
    const chars = keepOrder
      ? [...$('#cbText').value].filter(isHan)
      : unique($('#cbText').value);
    if (!chars.length) { toast('内容为空'); return; }
    updateCbCount();
    const opts = readCbOptions();    const t0 = performance.now();
    const preview = $('#sheetPreview');
    preview.innerHTML = '<div class="preview-empty">正在准备字库…</div>';

    // Warm strokes: classic-template batches use the single primer subset
    // bundle; other input loads per-block chunks (deduped internally).
    await StrokeData.ensureChars(chars, { primerBundle: state.usePrimerBundle });
    const t1 = performance.now();

    const strokesMap = {};
    for (const ch of chars) strokesMap[ch] = StrokeData.getCached(ch);
    const pages = Sheet.buildPages(chars, strokesMap, opts, state.pinyin);
    state.pages = pages;
    const t2 = performance.now();

    preview.innerHTML = '';
    pages.forEach((svg) => preview.appendChild(svg));
    $('#cbPerf').textContent =
      `${chars.length} 字 · ${pages.length} 页 · 数据 ${(t1 - t0).toFixed(0)}ms / 排版 ${(t2 - t1).toFixed(0)}ms / 共 ${(t2 - t0).toFixed(0)}ms`;
  }

  function initCopybookTab() {
    $('#cbText').addEventListener('input', updateCbCount);

    function seg(id, key, cb) {
      $('#' + id).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $$('#' + id + ' button').forEach((x) => x.classList.toggle('active', x === b));
        state.settings[key] = b.dataset.v;
        saveSettings();
        if (cb) cb();
      });
    }
    seg('gridTypeSeg', 'grid');
    seg('traceGridSeg', 'traceGrid');

    $('#cbTrace').addEventListener('change', (e) => {
      state.settings.trace = e.target.checked;
      saveSettings();
    });
    $('#cbTraceOpacity').addEventListener('input', (e) => {
      state.settings.traceOpacity = +e.target.value;
      $('#cbTraceOpacityVal').textContent = Math.round(+e.target.value * 100) + '%';
      saveSettings();
    });
    $('#cbBlanks').addEventListener('change', (e) => { state.settings.blanks = +e.target.value; saveSettings(); });
    $('#cbCellSize').addEventListener('change', (e) => { state.settings.cellSize = +e.target.value; saveSettings(); });
    $('#cbPinyin').addEventListener('change', (e) => { state.settings.pinyinOn = e.target.checked; saveSettings(); });

    $('#cbGenerate').addEventListener('click', generateCopybook);
    $('#cbPrint').addEventListener('click', () => {
      if (!state.pages.length) return toast('请先生成预览');
      Sheet.printPages(state.pages);
    });
    $('#cbPng').addEventListener('click', async () => {
      if (!state.pages.length) return toast('请先生成预览');
      toast('正在导出 PNG…');
      await Sheet.exportPNG(state.pages, fileBase());
      toast('PNG 已导出');
    });
    $('#cbPdf').addEventListener('click', async () => {
      if (!state.pages.length) return toast('请先生成预览');
      const msg = $('#cbProgress');
      msg.textContent = '正在生成 PDF…';
      try {
        await Sheet.exportPDF(state.pages, fileBase(), (i, n) => {
          msg.textContent = `PDF 渲染中 ${i}/${n}`;
        });
        msg.textContent = 'PDF 已下载';
      } catch (e) {
        msg.textContent = 'PDF 生成失败：' + e.message;
      }
    });
    $('#cbSave').addEventListener('click', saveCopybook);
  }

  function fileBase() {
    const t = $('#cbTitle').value.trim();
    return '临摹本-' + (t || [...$('#cbText').value].filter(isHan).slice(0, 8).join('') || 'hanzi');
  }

  async function saveCopybook() {
    const text = [...$('#cbText').value].filter(isHan).join('');
    if (!text) return toast('内容为空');
    const opts = readCbOptions();
    const item = {
      id: DB.uid(),
      name: opts.title || text.slice(0, 10),
      text,
      opts,
      savedAt: Date.now(),
    };
    state.favorites.copybooks.push(item);
    await DB.put('favorites', { id: 'main', ...state.favorites });
    toast('字帖已保存到「我的字帖」');
  }

  // =====================================================================
  //  Mine tab
  // =====================================================================
  async function renderMine() {
    const box = $('#favChars');
    box.innerHTML = '';
    if (!state.favorites.chars.length) {
      box.innerHTML = '<span class="muted">还没有收藏的单字。在笔顺动画页点 ☆ 收藏。</span>';
    }
    state.favorites.chars.forEach((ch) => {
      const btn = document.createElement('button');
      btn.textContent = ch;
      btn.title = (state.pinyin[ch] || '') + '（点击查看笔顺）';
      btn.addEventListener('click', () => {
        switchTab('animate');
        $('#charInput').value = ch;
        state.queue = [ch]; state.qi = 0;
        loadCurrentChar();
      });
      box.appendChild(btn);
    });

    const list = $('#favCopybooks');
    list.innerHTML = '';
    if (!state.favorites.copybooks.length) {
      list.innerHTML = '<p class="muted">还没有保存的字帖。在模板或临摹本页可保存。</p>';
    }
    state.favorites.copybooks.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'copybook-item';
      const date = new Date(c.savedAt).toLocaleDateString();
      div.innerHTML =
        `<div class="meta"><b></b><small>${date} · ${[...c.text].length} 字</small>
         <div class="sample"></div></div>`;
      div.querySelector('b').textContent = c.name;
      div.querySelector('.sample').textContent = c.text.slice(0, 60);
      const open = document.createElement('button');
      open.className = 'btn primary';
      open.textContent = '打开';
      open.addEventListener('click', () => {
        $('#cbText').value = c.text;
        $('#cbTitle').value = c.opts && c.opts.title ? c.opts.title : (c.name || '');
        if (c.opts) applyOpts(c.opts);
        switchTab('copybook');
        updateCbCount();
        generateCopybook();
      });
      const del = document.createElement('button');
      del.className = 'btn danger';
      del.textContent = '删除';
      del.addEventListener('click', async () => {
        state.favorites.copybooks = state.favorites.copybooks.filter((x) => x.id !== c.id);
        await DB.put('favorites', { id: 'main', ...state.favorites });
        renderMine();
      });
      div.append(open, del);
      list.appendChild(div);
    });
  }

  function applyOpts(o) {
    const s = state.settings;
    if (o.grid) { s.grid = o.grid; setSeg('gridTypeSeg', o.grid); }
    if (o.traceGrid) { s.traceGrid = o.traceGrid; setSeg('traceGridSeg', o.traceGrid); }
    if (o.traceOpacity != null) { s.traceOpacity = o.traceOpacity; $('#cbTraceOpacity').value = o.traceOpacity; $('#cbTraceOpacityVal').textContent = Math.round(o.traceOpacity * 100) + '%'; }
    if (o.blanks != null) { s.blanks = o.blanks; $('#cbBlanks').value = o.blanks; }
    if (o.cellSize) { s.cellSize = o.cellSize; $('#cbCellSize').value = o.cellSize; }
    if (o.showPinyin != null) { s.pinyinOn = o.showPinyin; $('#cbPinyin').checked = o.showPinyin; }
    s.trace = o.trace !== false;
    $('#cbTrace').checked = s.trace;
  }
  function setSeg(id, v) {
    $$('#' + id + ' button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  }

  // =====================================================================
  //  Settings tab
  // =====================================================================
  function initSettingsTab() {
    $('#btnPreload').addEventListener('click', async () => {
      const bar = $('#preloadBar');
      const fill = $('#preloadBarFill');
      const msg = $('#preloadMsg');
      bar.hidden = false;
      const btn = $('#btnPreload');
      btn.disabled = true;
      try {
        const total = await StrokeData.preloadAll(({ done, total, chars }) => {
          fill.style.width = (done / total * 100) + '%';
          msg.textContent = `已缓存 ${done}/${total} 个分片，约 ${chars} 字`;
        });
        msg.textContent = '全部字库已缓存，可离线使用。';
        toast('字库预下载完成');
        try {
          if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            const reg = await navigator.serviceWorker.ready;
            if (reg.active) reg.active.postMessage({ type: 'CACHE_DATA' });
          }
        } catch (e) { /* sw optional */ }
      } catch (e) {
        msg.textContent = '预下载失败：' + e.message;
      } finally {
        btn.disabled = false;
      }
    });

    $('#btnOfflineStatus').addEventListener('click', async () => {
      let swCount = 0;
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          swCount = regs.length;
        }
      } catch (e) { /* unsupported */ }
      const m = await StrokeData.getManifest();
      $('#preloadMsg').textContent =
        `字库版本 ${m.version}（${m.generated}），共 ${m.chars} 字、${m.chunks.length} 分片；Service Worker ${swCount ? '已启用' : '未启用'}。`;
    });

    $('#btnExportJson').addEventListener('click', exportJSON);
    $('#btnImportJson').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', importJSON);
    $('#btnReset').addEventListener('click', resetAll);
  }

  async function exportJSON() {
    const data = {
      app: 'hanzi-tieben',
      exportedAt: new Date().toISOString(),
      favorites: state.favorites,
      settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    Sheet.downloadBlob(blob, 'hanzi-tieben-backup-' + new Date().toISOString().slice(0, 10) + '.json');
  }

  async function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'hanzi-tieben') throw new Error('文件格式不符');
      if (data.favorites) {
        state.favorites = { chars: [], copybooks: [], ...data.favorites };
        await DB.put('favorites', { id: 'main', ...state.favorites });
      }
      if (data.settings) {
        Object.assign(state.settings, data.settings);
        await DB.saveSettings(state.settings);
        applySettingsUI();
      }
      toast('导入成功');
    } catch (err) {
      toast('导入失败：' + err.message, 3500);
    }
    e.target.value = '';
  }

  async function resetAll() {
    if (!confirm('确定清空所有收藏、字帖与设置？此操作不可恢复。')) return;
    indexedDB.deleteDatabase('hanzi-tieben');
    state.favorites = { chars: [], copybooks: [] };
    toast('已重置，即将刷新…');
    setTimeout(() => location.reload(), 800);
  }

  // ---------- settings persistence ----------
  let saveTimer;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => DB.saveSettings(state.settings), 200);
  }

  function applySettingsUI() {
    const s = state.settings;
    $('#speedRange').value = s.speed;
    $('#speedVal').textContent = s.speed + '×';
    $('#btnLoop').classList.toggle('primary', s.loop);
    $('#optOutline').checked = s.outline;
    $('#optOutlineOpacity').value = s.outlineOpacity;
    $('#optMedian').checked = s.showMedian;
    setSeg('gridTypeSeg', s.grid);
    setSeg('traceGridSeg', s.traceGrid);
    $('#cbTrace').checked = s.trace;
    $('#cbTraceOpacity').value = s.traceOpacity;
    $('#cbTraceOpacityVal').textContent = Math.round(s.traceOpacity * 100) + '%';
    $('#cbBlanks').value = s.blanks;
    $('#cbCellSize').value = s.cellSize;
    $('#cbPinyin').checked = s.pinyinOn;
  }

  // ---------- boot ----------
  async function boot() {
    initTabs();
    initAnimTab();
    initTemplateTab();
    initCopybookTab();
    initSettingsTab();

    try {
      const [m, pinyin] = await Promise.all([
        StrokeData.getManifest(),
        StrokeData.getPinyinMap(),
      ]);
      state.pinyin = pinyin;
      $('#dataStatus').textContent = `本地字库 ${m.chars} 字 · ${m.generated} 数据版`;
      const about = $('#aboutList');
      about.innerHTML =
        `<li>字符总数：${m.chars} 个（含常用、次常用及繁体/古文字形）</li>` +
        `<li>数据分片：${m.chunks.length} 个，按需加载</li>` +
        `<li>坐标系：${m.coords}×${m.coords}，SVG 路径逐笔绘制</li>` +
        `<li>动画：requestAnimationFrame 按笔画推进</li>`;

      const [tpl, seq] = await Promise.all([
        fetch('data/templates.json').then((r) => r.json()),
        fetch('data/sequences.json').then((r) => r.json()),
      ]);
      state.templates = tpl;
      state.sequences = seq;
      renderTemplateGrid();
    } catch (e) {
      $('#dataStatus').textContent = '字库加载失败，请检查网络/部署路径';
      console.error(e);
    }

    // local settings & favorites
    try {
      const [saved, favs] = await Promise.all([
        DB.loadSettings(),
        DB.get('favorites', 'main'),
      ]);
      Object.entries(saved).forEach(([k, v]) => { state.settings[k] = v; });
      applySettingsUI();
      if (favs) state.favorites = { chars: favs.chars || [], copybooks: favs.copybooks || [] };
    } catch (e) { console.warn(e); }

    updateCbCount();
    loadCurrentChar();

    if ('serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('sw.js').catch(() => {}); }
      catch (e) { /* unsupported */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
