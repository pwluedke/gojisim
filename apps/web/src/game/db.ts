/**
 * GojiSim's IndexedDB database in this browser (M5f, M7a): the custom mat image (`mat`) and the
 * player's saved decks (`decks`). Every caller guards its calls: storage can be missing, blocked
 * or full, and the game still works for the current visit.
 */

const DB_NAME = "gojisim";
/** 1: the mat (M5f). 2: saved decks (M7a). */
const DB_VERSION = 2;
export type StoreName = "mat" | "decks";

/** Opens the database, creating any store a newer version added. */
export function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["mat", "decks"] satisfies StoreName[])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs one request in a transaction on `store`, resolving with its result once it commits. */
export async function runInStore<T>(
  idb: IDBFactory,
  store: StoreName,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb(idb);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = work(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The browser's IndexedDB, or `undefined` where it is missing or access throws. */
export function browserIdb(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}
