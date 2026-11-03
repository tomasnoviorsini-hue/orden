import { withTx, promisify, get, getAllByIndex, put } from '../../db/idb.js';

// Lecturas y borrado de movimientos. Las altas y modificaciones pasan por ingest/ingest.js.

const STORE = 'transactions';

/** Movimientos del período, del más reciente al más antiguo. */
export async function listByPeriod({ start, end }) {
  const transactions = await getAllByIndex(STORE, 'date', IDBKeyRange.bound(start, end));
  return transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export const getTransaction = (id) => get(STORE, id);

/** Elimina el movimiento y lo devuelve, para poder deshacer. */
export function deleteTransaction(id) {
  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const transaction = await promisify(store.get(id));
    if (transaction) store.delete(id);
    return transaction ?? null;
  });
}

export const restoreTransaction = (transaction) => put(STORE, transaction);
