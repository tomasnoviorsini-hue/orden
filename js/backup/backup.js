import { withTx, promisify, get, put } from '../db/idb.js';
import { DB_VERSION } from '../db/schema.js';
import { isValidISO, todayISO } from '../lib/date.js';

/*
 * Respaldo completo en JSON:
 *   { app: 'orden', format: 1, schemaVersion, exportedAt, data: { <almacén>: [registros] } }
 * La importación reemplaza todo en una sola transacción: si algo falla, no cambia nada.
 */

export const BACKUP_STORES = ['meta', 'categories', 'transactions', 'imports', 'tasks', 'periodIncome'];

const APP_ID = 'orden';
const FORMAT = 1;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const LABELS = {
  meta: 'ajustes',
  categories: 'categorías',
  transactions: 'movimientos',
  imports: 'importaciones',
  tasks: 'tareas',
  periodIncome: 'ingresos del período',
};

const isKind = (value) => value === 'income' || value === 'expense';
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

const VALIDATORS = {
  meta: (r) => typeof r.key === 'string',
  categories: (r) => typeof r.id === 'string' && typeof r.name === 'string' && isKind(r.kind),
  transactions: (r, refs) =>
    typeof r.id === 'string' && isKind(r.type) && isPositiveInt(r.amount) &&
    isValidISO(r.date) && refs.categoryIds.has(r.categoryId),
  imports: (r) => typeof r.id === 'string',
  tasks: (r) => typeof r.id === 'string' && isValidISO(r.date) && typeof r.title === 'string' && typeof r.done === 'boolean',
  periodIncome: (r) => isValidISO(r.start) && isPositiveInt(r.amount),
};

function fail(message) {
  throw new Error(message);
}

export async function exportData() {
  const data = await withTx(BACKUP_STORES, 'readonly', async (tx) => {
    const entries = await Promise.all(
      BACKUP_STORES.map(async (name) => [name, await promisify(tx.objectStore(name).getAll())])
    );
    return Object.fromEntries(entries);
  });
  return { app: APP_ID, format: FORMAT, schemaVersion: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Genera el archivo de respaldo y registra la fecha de exportación. */
export async function createBackupFile() {
  const backup = await exportData();
  const file = new File([JSON.stringify(backup)], `orden-respaldo-${todayISO()}.json`, { type: 'application/json' });
  await put('meta', { key: 'lastBackupAt', value: backup.exportedAt });
  return file;
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function getLastBackupAt() {
  return (await get('meta', 'lastBackupAt'))?.value ?? null;
}

/** Valida el contenido de un respaldo. Lanza un Error con un mensaje para mostrar si no es válido. */
export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    fail('El archivo no es un JSON válido.');
  }

  if (backup?.app !== APP_ID || !backup.data || typeof backup.data !== 'object') {
    fail('El archivo no es un respaldo de esta aplicación.');
  }
  if (backup.format !== FORMAT) fail('El formato del respaldo no es compatible.');
  if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion > DB_VERSION) {
    fail('El respaldo proviene de una versión más nueva de la aplicación. Actualice la aplicación e intente de nuevo.');
  }

  // Un respaldo de una versión anterior puede no tener los almacenes agregados después: se toman vacíos.
  const data = {};
  for (const name of BACKUP_STORES) {
    const records = backup.data[name] ?? [];
    if (!Array.isArray(records)) fail(`La sección de ${LABELS[name]} del respaldo está dañada.`);
    data[name] = records;
  }

  const refs = { categoryIds: new Set(data.categories.map((category) => category?.id)) };
  for (const name of BACKUP_STORES) {
    const index = data[name].findIndex(
      (record) => !record || typeof record !== 'object' || !VALIDATORS[name](record, refs)
    );
    if (index !== -1) fail(`El respaldo tiene ${LABELS[name]} con datos inválidos (registro ${index + 1}).`);
  }

  const exportedAt = typeof backup.exportedAt === 'string' && !Number.isNaN(Date.parse(backup.exportedAt))
    ? backup.exportedAt
    : null;
  return { exportedAt, schemaVersion: backup.schemaVersion, data };
}

export async function readBackupFile(file) {
  if (file.size > MAX_FILE_BYTES) fail('El archivo es demasiado grande para ser un respaldo.');
  return parseBackup(await file.text());
}

/** Reemplaza todos los datos por los del respaldo, en una sola transacción (todo o nada). */
export function restoreBackup({ data }) {
  return withTx(BACKUP_STORES, 'readwrite', (tx) => {
    for (const name of BACKUP_STORES) {
      const store = tx.objectStore(name);
      store.clear();
      data[name].forEach((record) => store.put(record));
    }
  });
}
