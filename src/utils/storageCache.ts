import { MotionTake } from '@/src/types/mocap';

const DB_NAME = 'kinetix_mocap_studio_db';
const DB_VERSION = 1;
const STORE_TAKES = 'takes';
const STORE_MODELS = 'models';
const POSE_MODEL_KEY = 'pose_landmarker_task_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'));
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
    req.onerror = () => reject(req.error ?? new Error('无法打开本地数据库'));
  });
}

export async function saveTakeToLocalDb(take: MotionTake): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TAKES, 'readwrite');
      tx.objectStore(STORE_TAKES).put(take);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal fallback if storage quota exceeded
  }
}

export async function loadSavedTakesFromLocalDb(): Promise<MotionTake[]> {
  try {
    const db = await openDb();
    const list = await new Promise<MotionTake[]>((resolve, reject) => {
      const tx = db.transaction(STORE_TAKES, 'readonly');
      const req = tx.objectStore(STORE_TAKES).getAll();
      req.onsuccess = () => resolve((req.result as MotionTake[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function deleteTakeFromLocalDb(takeId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TAKES, 'readwrite');
      tx.objectStore(STORE_TAKES).delete(takeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function saveCachedPoseModel(buffer: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readwrite');
      tx.objectStore(STORE_MODELS).put(buffer, POSE_MODEL_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore storage error
  }
}

export async function loadCachedPoseModel(): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const data = await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readonly');
      const req = tx.objectStore(STORE_MODELS).get(POSE_MODEL_KEY);
      req.onsuccess = () => {
        const res = req.result;
        if (res instanceof Uint8Array) resolve(res);
        else if (res instanceof ArrayBuffer) resolve(new Uint8Array(res));
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data;
  } catch {
    return null;
  }
}

export async function hasCachedPoseModel(): Promise<boolean> {
  const buf = await loadCachedPoseModel();
  return Boolean(buf && buf.byteLength > 100_000);
}
