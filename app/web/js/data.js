// data.js - stroke-data loading, decoding, stroke classification
(function (global) {
  'use strict';

  const DATA = 'data/';
  const chunkCache = new Map();      // chunkName -> Promise(obj)
  const charCache = new Map();       // char -> decoded strokes
  let manifestPromise = null;
  let pinyinPromise = null;
  let primersPromise = null;         // Promise<Set<char>> for the primer subset bundle
  const inflightChar = new Map();

  function loadJSON(url) {
    return fetch(url, { cache: 'force-cache' }).then((r) => {
      if (!r.ok) throw new Error('加载失败: ' + url);
      return r.json();
    });
  }

  function getManifest() {
    if (!manifestPromise) manifestPromise = loadJSON(DATA + 'manifest.json');
    return manifestPromise;
  }

  function getPinyinMap() {
    if (!pinyinPromise) pinyinPromise = loadJSON(DATA + 'pinyin.json');
    return pinyinPromise;
  }

  function chunkName(char) {
    const start = char.codePointAt(0) - (char.codePointAt(0) % 256);
    return 'c' + start.toString(16) + '.json';
  }

  function loadChunk(name) {
    if (!chunkCache.has(name)) chunkCache.set(name, loadJSON(DATA + name));
    return chunkCache.get(name);
  }

  // Decode a compact stroke record into path segments + median.
  // types: 0=M 1=L 2=Q 3=C 4=Z ; stroke tokens end with -1, median with -2
  function decodeRecord(rec) {
    const strokes = [];
    let i = 0;
    while (i < rec.length) {
      const segments = [];
      while (rec[i] !== -1) {
        const type = rec[i++];
        const n = type === 4 ? 0 : type === 3 ? 6 : type === 2 ? 4 : 2;
        const seg = [type];
        for (let k = 0; k < n; k++) seg.push(rec[i++]);
        segments.push(seg);
      }
      i++; // skip -1
      const median = [];
      while (rec[i] !== -2) {
        median.push([rec[i], rec[i + 1]]);
        i += 2;
      }
      i++; // skip -2
      strokes.push({ segments, median });
    }
    return strokes;
  }

  // Fetch the single-file bundle of all classic-primer characters.
  // Resolves to a Set of decoded strokes keyed by char, or null on failure.
  function preloadPrimers() {
    if (primersPromise) return primersPromise;
    primersPromise = loadJSON(DATA + 'primers.json')
      .then((bundle) => {
        for (const [c, rec] of Object.entries(bundle)) {
          if (!charCache.has(c)) {
            const decoded = decodeRecord(rec);
            decoded.forEach((s) => { s.type = classifyStroke(s); });
            charCache.set(c, decoded);
          }
        }
        return new Set(Object.keys(bundle));
      })
      .catch(() => null);
    return primersPromise;
  }

  // fetch + decode one character; returns null when no data exists
  function loadChar(char) {
    if (charCache.has(char)) return Promise.resolve(charCache.get(char));
    if (inflightChar.has(char)) return inflightChar.get(char);
    const p = getManifest()
      .then(() => loadChunk(chunkName(char)))
      .then((chunk) => {
        const rec = chunk[char];
        if (!rec) {
          charCache.set(char, null);
          return null;
        }
        const decoded = decodeRecord(rec);
        decoded.forEach((s) => { s.type = classifyStroke(s); });
        charCache.set(char, decoded);
        return decoded;
      })
      .catch(() => null)
      .finally(() => inflightChar.delete(char));
    inflightChar.set(char, p);
    return p;
  }

  // Ensure a list of chars is available. Pass {primerBundle:true} to load
  // the single-file classic-primer subset in one request; otherwise chars
  // resolve lazily through their small per-block chunks.
  async function ensureChars(chars, opts) {
    if (opts && opts.primerBundle) {
      await preloadPrimers(); // caches all primer chars in one request
    }
    const missing = chars.filter((c) => !charCache.has(c));
    if (missing.length) {
      await Promise.all(missing.map((c) => loadChar(c)));
    }
  }

  function getCached(char) {
    return charCache.get(char) || null;
  }

  // rebuild an SVG path string
  function toPathD(segments) {
    const NAMES = ['M', 'L', 'Q', 'C', 'Z'];
    let d = '';
    for (const seg of segments) {
      d += NAMES[seg[0]];
      for (let k = 1; k < seg.length; k++) d += (k > 1 ? ',' : ' ') + seg[k];
    }
    return d;
  }

  // median points -> polyline path
  function medianD(median) {
    return 'M' + median.map((p) => p[0] + ',' + p[1]).join(' L');
  }

  function polyLen(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return len;
  }

  // Classify a stroke into 横竖撇捺点折 from its median geometry.
  // Medians run pen-start -> pen-end. Source coords are y-up, so y is
  // negated below to screen y-down when measuring direction.
  function classifyStroke(s) {
    const m = s.median;
    const path = polyLen(m);
    const disp = Math.hypot(m[0][0] - m[m.length - 1][0], m[0][1] - m[m.length - 1][1]);

    // 折/钩/弯: sharp per-segment turn, or a strongly curved long median
    let maxTurn = 0;
    for (let i = 1; i < m.length - 1; i++) {
      const a1 = Math.atan2(m[i][1] - m[i - 1][1], m[i][0] - m[i - 1][0]);
      const a2 = Math.atan2(m[i + 1][1] - m[i][1], m[i + 1][0] - m[i][0]);
      let turn = Math.abs(a2 - a1);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > maxTurn) maxTurn = turn;
    }
    if (maxTurn > 1.12 || (path / Math.max(disp, 1) > 1.3 && path > 700)) return '折';

    // overall run direction in screen coords
    const runH = Math.abs(m[m.length - 1][0] - m[0][0]) / path;
    const runV = Math.abs(m[m.length - 1][1] - m[0][1]) / path;
    if (runH >= 0.85) return '横';                 // 横 / 提
    if (runV >= 0.9) return '竖';                  // 竖 / 竖钩(无明显折)

    // 点: short stroke without a clear horizontal/vertical run
    if (path < 240 && disp < 230 && m.length <= 5) return '点';

    // diagonals: 捺 sweeps out to the right, 撇 sweeps to the lower-left
    const endAng = Math.atan2(
      -(m[m.length - 1][1] - m[0][1]),
      m[m.length - 1][0] - m[0][0]
    );
    return runH > 0.65 && endAng > 0 ? '捺' : '撇';
  }

  const STROKE_NAMES = { '横': '横', '竖': '竖', '撇': '撇', '捺': '捺', '点': '点', '折': '折' };
  const STROKE_COLORS = {
    '横': '#d9411e', '竖': '#1e7ad9', '撇': '#2ca02c',
    '捺': '#8e44ad', '点': '#e6a100', '折': '#0e8f8f',
  };

  // Preload every chunk (used by "offline preload" + warmup).
  async function preloadAll(onProgress) {
    const m = await getManifest();
    let done = 0;
    const size = m.chunks.reduce((a, c) => a + c[1], 0);
    let loadedChars = 0;
    for (const [name, count] of m.chunks) {
      const obj = await loadChunk(name);
      done++;
      loadedChars += count;
      if (onProgress) onProgress({ done, total: m.chunks.length, chars: loadedChars, size });
      // yield to UI periodically
      if ((done & 3) === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return size;
  }

  function cachedCharCount() {
    return charCache.size;
  }

  global.StrokeData = {
    getManifest, getPinyinMap, loadChar, getCached, chunkName,
    preloadPrimers, ensureChars,
    toPathD, medianD, polyLen, decodeRecord, classifyStroke,
    STROKE_NAMES, STROKE_COLORS, preloadAll, cachedCharCount,
  };
})(window);
