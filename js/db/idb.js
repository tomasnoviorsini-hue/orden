import { DB_NAME, DB_VERSION, upgrade } from './schema.js';

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion, request.transaction);
      request.onsuccess = () => {
        const db = request.result;
        // Otra pestaña abrió una versión más nueva: cerrar y recargar para tomarla.
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('La aplicación está abierta en otra pestaña con una versión anterior. Ciérrela y vuelva a intentar.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Ejecuta fn(tx) dentro de una transacción y resuelve con su valor de retorno
 * recién cuando la transacción se confirma. Dentro de fn solo se pueden esperar
 * requests de IndexedDB (no fetch ni timers), o la transacción se cierra sola.
 */
export async function withTx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción cancelada.'));
    Promise.resolve()
      .then(() => fn(tx))
      .then(
        (value) => { result = value; },
        (error) => {
          try { tx.abort(); } catch { /* ya finalizada */ }
          reject(error);
        }
      );
  });
}

export const get = (store, key) =>
  withTx(store, 'readonly', (tx) => promisify(tx.objectStore(store).get(key)));

export const getAll = (store, query) =>
  withTx(store, 'readonly', (tx) => promisify(tx.objectStore(store).getAll(query)));

export const getAllByIndex = (store, index, query) =>
  withTx(store, 'readonly', (tx) => promisify(tx.objectStore(store).index(index).getAll(query)));

export const countByIndex = (store, index, query) =>
  withTx(store, 'readonly', (tx) => promisify(tx.objectStore(store).index(index).count(query)));

export const put = (store, value) =>
  withTx(store, 'readwrite', (tx) => promisify(tx.objectStore(store).put(value)));

export const putMany = (store, values) =>
  withTx(store, 'readwrite', (tx) => {
    const objectStore = tx.objectStore(store);
    values.forEach((value) => objectStore.put(value));
    return values.length;
  });

export const del = (store, key) =>
  withTx(store, 'readwrite', (tx) => promisify(tx.objectStore(store).delete(key)));

export const clear = (store) =>
  withTx(store, 'readwrite', (tx) => promisify(tx.objectStore(store).clear()));
