import { withTx, promisify, getAll } from '../../../db/idb.js';
import { uid } from '../../../lib/id.js';
import { isValidISO } from '../../../lib/date.js';
import { isCurrency, DEFAULT_CURRENCY } from '../../../lib/money.js';

/*
 * Único punto de escritura de movimientos.
 *
 * Una fuente (carga manual hoy; resúmenes bancarios en el futuro) convierte su entrada
 * en TransactionDraft[] y llama a ingest():
 *
 *   TransactionDraft = {
 *     type: 'income' | 'expense',
 *     amount: number,          // centavos, entero > 0
 *     currency?: 'ARS' | 'USD', // por defecto ARS
 *     paymentMethodId?: string, // solo gastos; null si no se indicó
 *     date: 'YYYY-MM-DD',
 *     categoryId: string,
 *     description?: string,
 *     externalRef?: string,    // identificador del banco, si existe
 *   }
 *
 * Pasos: normalizar → validar → huella → deduplicar (solo importaciones) → guardar
 * todo en una transacción → registrar la importación.
 */

export const DESCRIPTION_MAX = 140;
const MAX_AMOUNT = 1e13; // centavos
const TYPES = new Set(['income', 'expense']);

function normalize(draft) {
  return {
    type: draft.type,
    amount: typeof draft.amount === 'number' ? Math.round(draft.amount) : NaN,
    currency: draft.currency ?? DEFAULT_CURRENCY,
    date: String(draft.date ?? ''),
    categoryId: draft.categoryId ?? null,
    paymentMethodId: draft.type === 'expense' ? draft.paymentMethodId || null : null,
    description: String(draft.description ?? '').trim().replace(/\s+/g, ' ').slice(0, DESCRIPTION_MAX),
    externalRef: draft.externalRef ?? null,
  };
}

function validate(record, categoriesById, methodsById) {
  if (!TYPES.has(record.type)) return 'El tipo de movimiento no es válido.';
  if (!Number.isInteger(record.amount) || record.amount <= 0) return 'Ingrese un monto válido mayor a cero.';
  if (record.amount > MAX_AMOUNT) return 'El monto es demasiado grande.';
  if (!isCurrency(record.currency)) return 'La moneda no es válida.';
  if (!isValidISO(record.date)) return 'Ingrese una fecha válida.';
  const category = categoriesById.get(record.categoryId);
  if (!category) return 'Elija una categoría.';
  if (category.kind !== record.type) return 'La categoría no corresponde al tipo de movimiento.';
  if (record.paymentMethodId && !methodsById.has(record.paymentMethodId)) return 'El medio de pago no es válido.';
  return null;
}

// Hash FNV-1a doble (64 bits en hex). Sincrónico para poder usarlo dentro de una transacción.
function hash(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x5bd1e995;
  for (const char of text) {
    const code = char.codePointAt(0);
    h1 = Math.imul(h1 ^ code, 16777619);
    h2 = Math.imul(h2 ^ code, 2246822519);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** Texto sin tildes, en minúsculas y con espacios simples (para comparar descripciones). */
export const simplifyText = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Los movimientos en pesos conservan la huella de antes de que existieran las monedas.
export function fingerprint({ date, type, amount, description, currency = DEFAULT_CURRENCY }) {
  const suffix = currency === DEFAULT_CURRENCY ? '' : `|${currency}`;
  return hash(`${date}|${type}|${amount}|${simplifyText(description)}${suffix}`);
}

async function prepare(drafts) {
  const [categories, methods] = await Promise.all([getAll('categories'), getAll('paymentMethods')]);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const methodsById = new Map(methods.map((method) => [method.id, method]));
  return drafts.map((draft, index) => {
    const record = normalize(draft);
    return { index, record, error: validate(record, categoriesById, methodsById) };
  });
}

/**
 * Guarda movimientos nuevos.
 * Devuelve { inserted: Transaction[], skipped: number[], errors: { index, message }[] }.
 * La carga manual no deduplica: dos gastos iguales el mismo día son válidos.
 */
export async function ingest(drafts, { kind = 'manual', fileName = null, dedupe = kind !== 'manual' } = {}) {
  const prepared = await prepare(drafts);
  const errors = prepared.filter((item) => item.error).map(({ index, error }) => ({ index, message: error }));
  const valid = prepared.filter((item) => !item.error);
  const now = new Date().toISOString();
  const importId = kind === 'manual' ? null : uid();

  return withTx(['transactions', 'imports'], 'readwrite', async (tx) => {
    const store = tx.objectStore('transactions');
    const inserted = [];
    const skipped = [];
    const seen = new Set();

    for (const { index, record } of valid) {
      const print = fingerprint(record);
      if (dedupe && (seen.has(print) || (await promisify(store.index('fingerprint').count(print))) > 0)) {
        skipped.push(index);
        continue;
      }
      seen.add(print);
      const { externalRef, ...fields } = record;
      const transaction = {
        id: uid(),
        ...fields,
        fingerprint: print,
        source: { kind, importId, externalRef },
        createdAt: now,
        updatedAt: now,
      };
      store.put(transaction);
      inserted.push(transaction);
    }

    if (importId && inserted.length) {
      tx.objectStore('imports').put({
        id: importId,
        sourceKind: kind,
        fileName,
        importedAt: now,
        count: inserted.length,
        skippedDuplicates: skipped.length,
      });
    }

    return { inserted, skipped, errors };
  });
}

/** Modifica un movimiento existente con las mismas reglas de validación. Conserva su origen. */
export async function updateTransaction(id, draft) {
  const [{ record, error }] = await prepare([draft]);
  if (error) throw new Error(error);

  return withTx('transactions', 'readwrite', async (tx) => {
    const store = tx.objectStore('transactions');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('El movimiento ya no existe.');
    const { externalRef, ...fields } = record;
    const updated = { ...existing, ...fields, fingerprint: fingerprint(record), updatedAt: new Date().toISOString() };
    store.put(updated);
    return updated;
  });
}
