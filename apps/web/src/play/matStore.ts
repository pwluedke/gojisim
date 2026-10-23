/**
 * The custom mat image (M5f), stored in this browser's IndexedDB: the image file plus its scale
 * and position. Storage can be missing, blocked or full, so every call is guarded: a failed load
 * means the default mat, and a failed save keeps the image for this page view only.
 */

export interface MatImage {
  blob: Blob;
  /** Image width as a percentage of the mat's width (100 fills it). */
  scale: number;
  /** Background position, 0 to 100 percent on each axis (50 centers it). */
  x: number;
  y: number;
}

export const MAT_DEFAULTS = { scale: 100, x: 50, y: 50 } as const;

/** The largest image accepted, in bytes. */
export const MAT_MAX_BYTES = 8 * 1024 * 1024;

export const MAT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Why an upload is refused, or `null` when the file can be used. */
export function matFileProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!(MAT_TYPES as readonly string[]).includes(file.type))
    return "Use a PNG, JPG or WebP image.";
  if (file.size > MAT_MAX_BYTES)
    return `The image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAT_MAX_BYTES / 1024 / 1024} MB.`;
  return null;
}

const DB_NAME = "gojisim";
const STORE = "mat";
const KEY = "image";

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  idb: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open(idb);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The browser's IndexedDB, or `undefined` where it is missing or access throws. */
function browserIdb(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

export interface MatStore {
  /** The saved mat, or `null` (none saved, or storage unavailable). */
  load(): Promise<MatImage | null>;
  /** Saves the mat; resolves `false` when storage is unavailable. */
  save(mat: MatImage): Promise<boolean>;
  /** Forgets the saved mat (Reset to default). */
  clear(): Promise<boolean>;
}

/** A mat store on `idb` (the browser's IndexedDB by default; tests pass a fake). */
export function matStore(idb: IDBFactory | undefined = browserIdb()): MatStore {
  return {
    async load() {
      if (!idb) return null;
      try {
        const saved = await run<MatImage | undefined>(idb, "readonly", (s) =>
          s.get(KEY),
        );
        return saved && saved.blob instanceof Blob ? saved : null;
      } catch {
        return null;
      }
    },
    async save(mat) {
      if (!idb) return false;
      try {
        await run(idb, "readwrite", (s) => s.put(mat, KEY));
        return true;
      } catch {
        return false;
      }
    },
    async clear() {
      if (!idb) return false;
      try {
        await run(idb, "readwrite", (s) => s.delete(KEY));
        return true;
      } catch {
        return false;
      }
    },
  };
}
