// db.js - IndexedDB persistence for copybooks, favorites and settings
(function (global) {
  'use strict';

  const DB_NAME = 'hanzi-tieben';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('copybooks')) {
          db.createObjectStore('copybooks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function reqAsPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(store, value) {
    const s = await tx(store, 'readwrite');
    await reqAsPromise(s.put(value));
  }

  async function remove(store, id) {
    const s = await tx(store, 'readwrite');
    await reqAsPromise(s.delete(id));
  }

  async function getAll(store) {
    const s = await tx(store, 'readonly');
    return reqAsPromise(s.getAll());
  }

  async function get(store, id) {
    const s = await tx(store, 'readonly');
    return reqAsPromise(s.get(id));
  }

  // ---- settings (single object per key) ----
  async function loadSettings() {
    const rows = await getAll('settings');
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async function saveSettings(obj) {
    for (const [key, value] of Object.entries(obj)) {
      await put('settings', { key, value });
    }
  }

  async function setSetting(key, value) {
    await put('settings', { key, value });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  global.DB = { put, remove, getAll, get, loadSettings, saveSettings, setSetting, uid };
})(window);
