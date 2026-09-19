// IndexedDB 封装：字帖(collections)、收藏(favorites)、设置(settings)
// 全部数据留在浏览器本地，可整体导出/导入 JSON。

const DB_NAME = 'hanzi-xingben';
const DB_VERSION = 1;
const STORES = {
  collections: { key: 'id', index: 'updatedAt' },
  favorites: { key: 'name' },   // 收藏的字帖（按名称）或单字串
  settings: { key: 'key' },
};

let _dbp = null;

function openDB() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: cfg.key });
          if (cfg.index) store.createIndex(cfg.index, cfg.index);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbp;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbPut(store, value) {
  const s = await tx(store, 'readwrite');
  await reqP(s.put(value));
  return value;
}

export async function dbGet(store, key) {
  const s = await tx(store, 'readonly');
  return reqP(s.get(key));
}

export async function dbAll(store) {
  const s = await tx(store, 'readonly');
  return reqP(s.getAll());
}

export async function dbDelete(store, key) {
  const s = await tx(store, 'readwrite');
  await reqP(s.delete(key));
}

export async function dbClear(store) {
  const s = await tx(store, 'readwrite');
  await reqP(s.clear());
}

// 设置（带默认值合并）
const DEFAULT_SETTINGS = {
  speed: 1, loop: false, grid: 'tian', mode: 'demo',
  traceCount: 2, blankCount: 2, traceOpacity: 0.28,
  cols: 10, rows: 12, smallGuide: true,
};

export async function loadSettings() {
  try {
    const all = await dbAll('settings');
    const o = { ...DEFAULT_SETTINGS };
    for (const row of all) o[row.key] = row.value;
    return o;
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export async function saveSettings(patch) {
  const cur = await loadSettings();
  const next = { ...cur, ...patch };
  for (const [k, v] of Object.entries(next)) {
    await dbPut('settings', { key: k, value: v });
  }
  return next;
}

// 整体导出/导入
export async function exportAll() {
  const [collections, favorites, settings] = await Promise.all([
    dbAll('collections'), dbAll('favorites'), dbAll('settings'),
  ]);
  return {
    app: 'hanzi-xingben',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections, favorites, settings,
  };
}

export async function importAll(data, { merge = true } = {}) {
  if (!data || data.app !== 'hanzi-xingben') throw new Error('文件格式不正确');
  if (!merge) {
    await Promise.all([dbClear('collections'), dbClear('favorites'), dbClear('settings')]);
  }
  for (const v of (data.collections || [])) await dbPut('collections', v);
  for (const v of (data.favorites || [])) await dbPut('favorites', v);
  for (const v of (data.settings || [])) await dbPut('settings', v);
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
