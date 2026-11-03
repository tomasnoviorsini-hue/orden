import { withTx, promisify, getAll, countByIndex } from '../../db/idb.js';
import { uid } from '../../lib/id.js';

const STORE = 'categories';
export const NAME_MAX = 40;

export const CATEGORY_COLORS = [
  '#5b9bd5', '#4fb3a9', '#6cc08b', '#8fbf5a', '#d9a441', '#e39a5b',
  '#e07a6f', '#d982b5', '#9b8cd9', '#7fa7c9', '#c9b458', '#8a929c',
];

const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es');

/** Categorías activas, opcionalmente de un solo tipo ('expense' | 'income'). */
export async function listCategories(kind) {
  const all = await getAll(STORE);
  return all.filter((category) => !category.archived && (!kind || category.kind === kind)).sort(byOrder);
}

/** Todas las categorías por id, incluidas las archivadas, para mostrar movimientos viejos. */
export async function getCategoryMap() {
  return new Map((await getAll(STORE)).map((category) => [category.id, category]));
}

/** Cantidad de movimientos por categoría. */
export async function usageCounts(categories) {
  const counts = await Promise.all(
    categories.map((category) => countByIndex('transactions', 'categoryId', category.id))
  );
  return new Map(categories.map((category, i) => [category.id, counts[i]]));
}

function cleanName(name) {
  const value = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('Ingrese un nombre para la categoría.');
  return value.slice(0, NAME_MAX);
}

function cleanColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) throw new Error('Elija un color válido.');
  return color.toLowerCase();
}

function assertUnique(all, { id = null, kind, name }) {
  const key = name.toLocaleLowerCase('es');
  if (all.some((c) => c.id !== id && c.kind === kind && c.name.toLocaleLowerCase('es') === key)) {
    throw new Error('Ya existe una categoría con ese nombre.');
  }
}

export function createCategory({ kind, name, color }) {
  if (kind !== 'expense' && kind !== 'income') throw new Error('El tipo de categoría no es válido.');
  const clean = { name: cleanName(name), color: cleanColor(color) };

  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const all = await promisify(store.getAll());
    assertUnique(all, { kind, name: clean.name });
    const now = new Date().toISOString();
    const order = Math.max(-1, ...all.filter((c) => c.kind === kind).map((c) => c.order)) + 1;
    const category = { id: uid(), ...clean, kind, order, archived: false, createdAt: now, updatedAt: now };
    store.put(category);
    return category;
  });
}

export function updateCategory(id, { name, color }) {
  const clean = { name: cleanName(name), color: cleanColor(color) };

  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const all = await promisify(store.getAll());
    const category = all.find((c) => c.id === id);
    if (!category) throw new Error('La categoría ya no existe.');
    assertUnique(all, { id, kind: category.kind, name: clean.name });
    const updated = { ...category, ...clean, updatedAt: new Date().toISOString() };
    store.put(updated);
    return updated;
  });
}

/** Solo se puede eliminar una categoría que nunca se usó. */
export function deleteCategory(id) {
  return withTx([STORE, 'transactions'], 'readwrite', async (tx) => {
    const used = await promisify(tx.objectStore('transactions').index('categoryId').count(id));
    if (used) {
      throw new Error(`No se puede eliminar: la categoría tiene ${used} ${used === 1 ? 'movimiento' : 'movimientos'}.`);
    }
    tx.objectStore(STORE).delete(id);
  });
}
