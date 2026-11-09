import { parseARS } from '../../../../lib/money.js';
import { ingest, updateTransaction } from '../ingest.js';

// Fuente "manual": convierte los valores del formulario en un TransactionDraft.
// Una fuente futura (por ejemplo, un CSV bancario) seguirá el mismo patrón: archivo → drafts → ingest().

export function fromForm({ type, currency, amountText, date, categoryId, paymentMethodId, description }) {
  return { type, currency, amount: parseARS(amountText), date, categoryId, paymentMethodId, description };
}

/** Crea (sin id) o modifica (con id) un movimiento cargado a mano. */
export async function saveManualTransaction(form, id = null) {
  const draft = fromForm(form);
  if (id) return updateTransaction(id, draft);

  const { inserted, errors } = await ingest([draft], { kind: 'manual' });
  if (errors.length) throw new Error(errors[0].message);
  return inserted[0];
}
