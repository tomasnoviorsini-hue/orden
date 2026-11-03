import { withTx, getAll } from '../../db/idb.js';

// Ingreso fijo del período (por ejemplo, el sueldo). Un registro vale para su período
// y para los siguientes, hasta que otro período tenga el suyo.

const STORE = 'periodIncome';

/** Todos los registros, del más antiguo al más reciente. */
export async function listPeriodIncomes() {
  return (await getAll(STORE)).sort((a, b) => a.start.localeCompare(b.start));
}

export function setPeriodIncome(period, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Ingrese un monto válido mayor a cero.');
  return withTx(STORE, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE);
    // Si cambió el día de inicio del período, puede haber un registro con otra fecha dentro del rango.
    store.delete(IDBKeyRange.bound(period.start, period.end));
    store.put({ start: period.start, amount, updatedAt: new Date().toISOString() });
  });
}

export function removePeriodIncome(period) {
  return withTx(STORE, 'readwrite', (tx) => {
    tx.objectStore(STORE).delete(IDBKeyRange.bound(period.start, period.end));
  });
}
