// 笔顺数据加载（本地内置 makemeahanzi 系，9574 字）
// 原始中线：数学坐标系（y 向上）、方向为「起笔→收笔」。
// 本应用统一使用 SVG 视图坐标（y 向下，原点左上），故取数时做 y -> 1024-y 转换。

const DATA_URL = 'data/strokes.json';
export const DATA_SIZE = 1024;

let _raw = null;
let _cache = new Map();
let _loading = null;

async function loadRaw() {
  if (_raw) return _raw;
  if (!_loading) {
    _loading = fetch(DATA_URL, { cache: 'force-cache' })
      .then(r => {
        if (!r.ok) throw new Error('笔顺数据加载失败: HTTP ' + r.status);
        return r.json();
      })
      .then(j => { _raw = j; return j; });
  }
  return _loading;
}

function toView(medians) {
  // y 翻转；顺序保持起笔→收笔
  return medians.map(m => m.map(([x, y]) => [x, DATA_SIZE - y]));
}

export function getChar(ch) {
  if (_cache.has(ch)) return _cache.get(ch);
  if (!_raw || !_raw[ch]) { _cache.set(ch, null); return null; }
  const med = toView(_raw[ch]);
  _cache.set(ch, med);
  return med;
}

/** 数据是否覆盖该字（异步，确保数据已加载） */
export async function hasChar(ch) {
  await loadRaw();
  return !!getChar(ch);
}

/** 预取一批字；返回实际有数据的字数 */
export async function ensureChars(chars) {
  await loadRaw();
  let n = 0;
  for (const ch of new Set(chars)) if (getChar(ch)) n++;
  return n;
}

export function loadData() { return loadRaw(); }

export async function totalChars() {
  const raw = await loadRaw();
  return Object.keys(raw).length;
}

/** 提取汉字（CJK 统一表意文字区 + 扩展A），保留输入顺序，允许重复 */
export function extractHan(text) {
  const m = text.match(/[一-鿿㐀-䶿]/g);
  return m ? Array.from(m) : [];
}

/** 提取汉字并去重（字帖生成用） */
export function uniqueHan(text) {
  return Array.from(new Set(extractHan(text)));
}
