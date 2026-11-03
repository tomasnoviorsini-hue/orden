import { uid } from '../lib/id.js';

export const DB_NAME = 'orden';
export const DB_VERSION = 3;

export const DEFAULT_SETTINGS = Object.freeze({
  periodStartDay: 17,
});

const EXPENSE_CATEGORIES = [
  ['Vivienda', '#5b9bd5'],
  ['Servicios', '#4fb3a9'],
  ['Supermercado', '#6cc08b'],
  ['Transporte', '#d9a441'],
  ['Salud', '#e07a6f'],
  ['Educación', '#9b8cd9'],
  ['Ocio', '#d982b5'],
  ['Ropa', '#c9b458'],
  ['Suscripciones', '#7fa7c9'],
  ['Otros', '#8a929c'],
];

const INCOME_CATEGORIES = [
  ['Sueldo', '#6cc08b'],
  ['Extras', '#4fb3a9'],
  ['Otros ingresos', '#8a929c'],
];

function seedCategories(store, list, kind, now) {
  list.forEach(([name, color], order) => {
    store.put({ id: uid(), name, kind, color, order, archived: false, createdAt: now, updatedAt: now });
  });
}

// Cada clave es la versión a la que migra. Nunca modificar una migración ya publicada:
// agregar una nueva y subir DB_VERSION.
const migrations = {
  1(db, tx) {
    db.createObjectStore('meta', { keyPath: 'key' });

    const categories = db.createObjectStore('categories', { keyPath: 'id' });
    categories.createIndex('kind', 'kind');

    const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
    transactions.createIndex('date', 'date');
    transactions.createIndex('type_date', ['type', 'date']);
    transactions.createIndex('categoryId', 'categoryId');
    transactions.createIndex('fingerprint', 'fingerprint');
    transactions.createIndex('importId', 'source.importId');

    db.createObjectStore('imports', { keyPath: 'id' });

    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('date', 'date');

    const now = new Date().toISOString();
    const meta = tx.objectStore('meta');
    meta.put({ key: 'settings', value: { ...DEFAULT_SETTINGS } });
    meta.put({ key: 'createdAt', value: now });

    const categoryStore = tx.objectStore('categories');
    seedCategories(categoryStore, EXPENSE_CATEGORIES, 'expense', now);
    seedCategories(categoryStore, INCOME_CATEGORIES, 'income', now);
  },

  // Ingreso fijo por período: { start: 'YYYY-MM-DD' (inicio del período), amount (centavos), updatedAt }.
  2(db) {
    db.createObjectStore('periodIncome', { keyPath: 'start' });
  },

  // Moneda por movimiento ('ARS' | 'USD') e ingreso fijo por moneda:
  // periodIncomes = { currency, start, amount, updatedAt }, clave [currency, start].
  // Los datos anteriores quedan en pesos.
  3(db, tx) {
    const incomes = db.createObjectStore('periodIncomes', { keyPath: ['currency', 'start'] });
    const old = tx.objectStore('periodIncome');
    old.getAll().onsuccess = (event) => {
      event.target.result.forEach((record) => incomes.put({ ...record, currency: 'ARS' }));
      db.deleteObjectStore('periodIncome');
    };

    tx.objectStore('transactions').openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      if (!cursor.value.currency) cursor.update({ ...cursor.value, currency: 'ARS' });
      cursor.continue();
    };
  },
};

export function upgrade(db, oldVersion, tx) {
  for (let version = oldVersion + 1; version <= DB_VERSION; version++) {
    migrations[version](db, tx);
  }
}
