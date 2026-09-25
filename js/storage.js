export const DATA_SCHEMA_VERSION = 1;
const DB_NAME = 'machitalk';
const DB_VERSION = 1;
export const DEFAULT_SETTINGS = { schemaVersion: DATA_SCHEMA_VERSION, voice: '', speed: 1, captions: true, autoPlay: true, hintMode: false, selectedAvatar: 'aiko' };
let dbPromise;

function database() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('このブラウザでは端末保存が使えません。'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('playedAt', 'playedAt');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}

async function request(storeName, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const req = action(transaction.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadSettings() {
  const value = await request('settings', 'readonly', store => store.get('preferences'));
  return { ...DEFAULT_SETTINGS, ...(value?.value || {}) };
}
export async function saveSettings(value) {
  await request('settings', 'readwrite', store => store.put({ key: 'preferences', value: { ...value, schemaVersion: DATA_SCHEMA_VERSION } }));
}
export async function saveSession(session) {
  return request('sessions', 'readwrite', store => store.add({ ...session, schemaVersion: DATA_SCHEMA_VERSION }));
}
export async function loadSessions() {
  const rows = await request('sessions', 'readonly', store => store.getAll());
  return rows.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}
export async function persistenceStatus() {
  if (!navigator.storage?.persisted) return '未対応';
  return (await navigator.storage.persisted()) ? '有効' : '未取得';
}
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
