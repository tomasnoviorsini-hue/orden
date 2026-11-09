import { withTx, promisify, getAll, countByIndex } from '../../db/idb.js';
import { uid } from '../../lib/id.js';
import { NAME_MAX } from './categories.repo.js';

// Medios de pago de los gastos (Tarjeta, Mercado Pago, …). Solo los gastos tienen medio;
// los gastos cargados antes de que existieran quedan sin medio (paymentMethodId null).

const STORE = 'paymentMethods';

const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es');

export async function listPaymentMethods() {
  return (await getAll(STORE)).filter((method) => !method.archived).sort(byOrder);
}

/** Todos los medios por id, para mostrar movimientos. */
export async function getPaymentMethodMap() {
  return new Map((await getAll(STORE)).map((method) => [method.id, method]));
}

/** Cantidad de movimientos por medio. */
export async function paymentMethodUsage(methods) {
  const counts = await Promise.all(methods.map((method) => countByIndex('transactions', 'paymentMethodId', method.id)));
  return new Map(methods.map((method, i) => [method.id, counts[i]]));
}

function clean({ name, color }) {
  const value = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('Ingrese un nombre para el medio de pago.');
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) throw new Error('Elija un color válido.');
  return { name: value.slice(0, NAME_MAX), color: color.toLowerCase() };
}

function assertUnique(all, id, name) {
  const key = name.toLocaleLowerCase('es');
  if (all.some((method) => method.id !== id && method.name.toLocaleLowerCase('es') === key)) {
    throw new Error('Ya existe un medio de pago con ese nombre.');
  }
}

export function createPaymentMethod(values) {
  const fields = clean(values);
  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const all = await promisify(store.getAll());
    assertUnique(all, null, fields.name);
    const now = new Date().toISOString();
    const order = Math.max(-1, ...all.map((method) => method.order)) + 1;
    const method = { id: uid(), ...fields, order, archived: false, createdAt: now, updatedAt: now };
    store.put(method);
    return method;
  });
}

export function updatePaymentMethod(id, values) {
  const fields = clean(values);
  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const all = await promisify(store.getAll());
    const method = all.find((item) => item.id === id);
    if (!method) throw new Error('El medio de pago ya no existe.');
    assertUnique(all, id, fields.name);
    store.put({ ...method, ...fields, updatedAt: new Date().toISOString() });
  });
}

/** Como las categorías: solo se puede eliminar un medio que nunca se usó. */
export function deletePaymentMethod(id) {
  return withTx([STORE, 'transactions'], 'readwrite', async (tx) => {
    const used = await promisify(tx.objectStore('transactions').index('paymentMethodId').count(id));
    if (used) {
      throw new Error(`No se puede eliminar: el medio de pago tiene ${used} ${used === 1 ? 'movimiento' : 'movimientos'}.`);
    }
    tx.objectStore(STORE).delete(id);
  });
}
