import { withTx, getAll } from '../../db/idb.js';

// Ingreso fijo del período (por ejemplo, el sueldo), uno por moneda. Un registro vale para su
// período y para los siguientes, hasta que otro período tenga el suyo en esa misma moneda.

const STORE = 'periodIncomes';

const rangeOf = (currency, period) => IDBKeyRange.bound([currency, period.start], [currency, period.end]);

/** Registros de una moneda, del más antiguo al más reciente. */
export async function listPeriodIncomes(currency) {
  return (await getAll(STORE))
    .filter((record) => record.currency === currency)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function setPeriodIncome(currency, period, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Ingrese un monto válido mayor a cero.');
  return withTx(STORE, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE);
    // Si cambió el día de inicio del período, puede haber un registro con otra fecha dentro del rango.
    store.delete(rangeOf(currency, period));
    store.put({ currency, start: period.start, amount, updatedAt: new Date().toISOString() });
  });
}

export function removePeriodIncome(currency, period) {
  return withTx(STORE, 'readwrite', (tx) => {
    tx.objectStore(STORE).delete(rangeOf(currency, period));
  });
}
