// Build static stroke-data chunks, manifest, pinyin map and copybook templates
// for the hanzi stroke-order app.
//
// Inputs (downloaded into this dir):
//   package/        - hanzi-writer-data: <char>.json = {strokes:[svgPath], medians:[[x,y]...], radStrokes}
//   dictionary.txt  - makemeahanzi dictionary (pinyin, radical)
//   qianziwen.json / sanzijing-new.json / baijiaxing.json / dizigui.json
//   TSCharacters.txt - OpenCC traditional -> simplified
//   gb2312.txt      - GB2312 level-1 (row) / level-2 chars
// Output: ../app/web/data/*.json

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '..', 'app', 'web', 'data');
fs.mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const isHan = (c) => /[㐀-䶿一-鿿豈-﫿]/.test(c);

// Split an SVG path ("M 272 567 Q 306 613 ... Z") into compact tokens.
// Output: [type, x,y, ...coords]  type: 0=M 1=L 2=Q 3=C 4=Z
function encodePath(d) {
  const toks = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'Z') { out.push(4); continue; }
    const code = t === 'M' ? 0 : t === 'L' ? 1 : t === 'Q' ? 2 : 3;
    out.push(code);
    const n = code === 3 ? 6 : code === 0 || code === 1 ? 2 : 4;
    for (let k = 0; k < n; k++) {
      i++;
      out.push(Math.round(+toks[i]));
    }
  }
  return out;
}

// Median points rounded.
function encodeMedian(pts) {
  const out = [];
  for (const [x, y] of pts) out.push(Math.round(x), Math.round(y));
  return out;
}

// ---------- load dictionary (pinyin / radical) ----------
const dict = new Map();
for (const line of fs.readFileSync(path.join(ROOT, 'dictionary.txt'), 'utf8').trim().split('\n')) {
  const o = JSON.parse(line);
  dict.set(o.character, o);
}

// ---------- gather character data ----------
const dataDir = path.join(ROOT, 'package');
const dataFiles = new Set(fs.readdirSync(dataDir).filter((f) => f.endsWith('.json')));

// every character we need data for: available intersection of templates/common list
// is discovered below; here we simply package every char file we have.
const allChars = [];
for (const f of dataFiles) {
  const c = f.slice(0, -5);
  if (c.length === 1 && isHan(c)) allChars.push(c);
}

// chunk by code-point blocks of 256, only within the CJK ranges
const COORDS = 1024;
const chunks = new Map(); // chunkName -> object char -> [strokeTokens..., sep, median...]
const pinyin = {};
let totalStrokes = 0;

for (const c of allChars) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(dataDir, c + '.json'), 'utf8')); }
  catch { continue; }
  if (!raw.strokes || !raw.medians) continue;

  const rec = [];
  // strokes: flat encoded paths separated by -1 ; medians separated by -2
  raw.strokes.forEach((d, i) => {
    rec.push(...encodePath(d), -1);
    rec.push(...encodeMedian(raw.medians[i] || []), -2);
    totalStrokes++;
  });

  const cp = c.codePointAt(0);
  const start = cp - (cp % 256);
  const name = 'c' + start.toString(16) + '.json';
  if (!chunks.has(name)) chunks.set(name, {});
  chunks.get(name)[c] = rec;

  const info = dict.get(c);
  if (info && info.pinyin && info.pinyin.length) pinyin[c] = info.pinyin[0];
}

for (const [name, obj] of chunks) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
}

// ---------- manifest ----------
const chunkNames = [...chunks.keys()].sort();
const manifest = {
  version: 1,
  coords: COORDS,
  generated: new Date().toISOString().slice(0, 10),
  chars: allChars.length,
  chunks: chunkNames.map((n) => [n, Object.keys(chunks.get(n)).length]),
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));

// pinyin lookup (also covers simplified chars derived from traditional)
fs.writeFileSync(path.join(OUT, 'pinyin.json'), JSON.stringify(pinyin));

// ---------- traditional -> simplified mapping ----------
const t2s = new Map();
for (const line of fs.readFileSync(path.join(ROOT, 'TSCharacters.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [t, s] = line.split(/\s+/);
  if (t && s) t2s.set(t, s);
}
const toSimple = (c) => t2s.get(c) || c;

// rare-variant glyphs missing from the graphics set -> equivalent char with data
const FALLBACK = {
  '崐': '昆', '凊': '清', '磻': '溪', '寔': '实', '俶': '叔',
  '臯': '皋', '輶': '由', '𬨎': '由', '煒': '炜', '竝': '并',
  '茍': '苟', '誥': '诰', '磧': '债', '韞': '蕴', '籯': '赢',
};

// ---------- templates ----------
function flattenPrimer(file, getLines) {
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const raw = getLines(o);
  // keep chars in original order, strip punctuation/whitespace, map to
  // simplified and fall back to the original glyph if that has no data
  const out = [];
  const push = (ch) => {
    if (!isHan(ch)) return;
    let g = toSimple(ch);
    if (!dataFiles.has(g + '.json')) g = ch; // traditional form available
    if (!dataFiles.has(g + '.json')) g = FALLBACK[g] || g;
    if (dataFiles.has(g + '.json') && !out.includes(g)) out.push(g);
  };
  for (const ch of raw) push(ch);
  return out;
}

const templates = [];

const qzw = flattenPrimer('qianziwen.json', (o) => o.paragraphs.join(''));
templates.push({ id: 'qianziwen', name: '千字文', desc: '南朝·周興嗣 · 1000字', chars: qzw });

const sj = flattenPrimer('sanzijing-new.json', (o) => o.paragraphs.join(''));
templates.push({ id: 'sanzijing', name: '三字经', desc: '宋·王應麟 · ' + sj.length + '字', chars: sj });

const bj = flattenPrimer('baijiaxing.json', (o) => o.paragraphs.join(''));
templates.push({ id: 'baijiaxing', name: '百家姓', desc: '北宋 · ' + bj.length + '姓', chars: bj });

const dzo = JSON.parse(fs.readFileSync(path.join(ROOT, 'dizigui.json'), 'utf8'));
const dz = flattenPrimer('dizigui.json', () => dzo.content.map((c) => c.paragraphs.join(' ')).join(' '));
templates.push({ id: 'dizigui', name: '弟子规', desc: '清·李毓秀 · ' + dz.length + '字', chars: dz });

// common-character tables from GB2312 (3755 level-1 + 3008 level-2)
const [l1raw, l2raw] = fs.readFileSync(path.join(ROOT, 'gb2312.txt'), 'utf8').trim().split('\n');
const filterAvail = (s) => [...s].filter((c) => dataFiles.has(c + '.json'));
const common1 = filterAvail(l1raw);
const common2 = filterAvail(l2raw);
templates.push({ id: 'changyong3500', name: '常用字表（一级）', desc: 'GB2312 一级字 · ' + common1.length + '字', chars: common1 });
templates.push({ id: 'ciciyong3000', name: '次常用字表（二级）', desc: 'GB2312 二级字 · ' + common2.length + '字', chars: common2 });

// ordered char sequence for each primer WITH repeats (for sequential practice sheets)
function primerSequence(file, getLines) {
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const out = [];
  for (const ch of getLines(o)) {
    if (!isHan(ch)) continue;
    let g = toSimple(ch);
    if (!dataFiles.has(g + '.json')) g = ch;
    if (!dataFiles.has(g + '.json')) g = FALLBACK[g] || g;
    if (dataFiles.has(g + '.json')) out.push(g);
  }
  return out;
}
const sequences = {
  qianziwen: primerSequence('qianziwen.json', (o) => o.paragraphs.join('')),
  sanzijing: primerSequence('sanzijing-new.json', (o) => o.paragraphs.join('')),
  baijiaxing: primerSequence('baijiaxing.json', (o) => o.paragraphs.join('')),
  dizigui: primerSequence('dizigui.json', () => dzo.content.map((c) => c.paragraphs.join(' ')).join(' ')),
};

fs.writeFileSync(path.join(OUT, 'templates.json'), JSON.stringify(templates));
fs.writeFileSync(path.join(OUT, 'sequences.json'), JSON.stringify(sequences));

// ---------- primer subset bundle ----------
// One compact file with every character used by the four classic primers,
// so batch generating 千字文/三字经/… sheets only needs one JSON fetch.
const PRIMER_IDS = ['qianziwen', 'sanzijing', 'baijiaxing', 'dizigui'];
const primerChars = new Set();
for (const id of PRIMER_IDS) {
  sequences[id].forEach((c) => primerChars.add(c));
}
const primerBundle = {};
for (const c of primerChars) {
  const cp = c.codePointAt(0);
  const start = cp - (cp % 256);
  const obj = chunks.get('c' + start.toString(16) + '.json');
  if (obj && obj[c]) primerBundle[c] = obj[c];
}
fs.writeFileSync(path.join(OUT, 'primers.json'), JSON.stringify(primerBundle));
console.log('primers bundle:', Object.keys(primerBundle).length, 'chars',
  (fs.statSync(path.join(OUT, 'primers.json')).size / 1024).toFixed(0) + 'KB');

// ---------- report ----------
let bytes = 0;
for (const [name] of chunks) bytes += fs.statSync(path.join(OUT, name)).size;
console.log('chars:', allChars.length, 'strokes:', totalStrokes);
console.log('chunks:', chunkNames.length, 'total KB:', (bytes / 1024).toFixed(0));
console.log('pinyin entries:', Object.keys(pinyin).length);
for (const t of templates) console.log('template', t.id, t.chars.length);
for (const [k, v] of Object.entries(sequences)) console.log('sequence', k, v.length);
