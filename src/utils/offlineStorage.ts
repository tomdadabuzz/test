import { MotionTake } from '@/src/types/mocap';

const DB_NAME = 'kinetix-mocap-db';
const DB_VERSION = 1;
const STORE_TAKES = 'takes';
const STORE_MODELS = 'models';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TAKES)) {
        db.createObjectStore(STORE_TAKES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveUserTakesToDb(takes: MotionTake[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TAKES, 'readwrite');
    const store = tx.objectStore(STORE_TAKES);
    store.clear();
    for (const t of takes) {
      if (!t.id.startsWith('preset_')) {
        store.put(t);
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Graceful no-op in private browsing
  }
}

export async function loadUserTakesFromDb(): Promise<MotionTake[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TAKES, 'readonly');
    const store = tx.objectStore(STORE_TAKES);
    const req = store.getAll();
    const items = await new Promise<MotionTake[]>((res, rej) => {
      req.onsuccess = () => res((req.result as MotionTake[]) ?? []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveCachedModelBuffer(key: string, buf: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MODELS, 'readwrite');
    tx.objectStore(STORE_MODELS).put(buf, key);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Graceful no-op
  }
}

export async function loadCachedModelBuffer(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MODELS, 'readonly');
    const req = tx.objectStore(STORE_MODELS).get(key);
    const val = await new Promise<Uint8Array | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as Uint8Array | undefined);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return val ?? null;
  } catch {
    return null;
  }
}
