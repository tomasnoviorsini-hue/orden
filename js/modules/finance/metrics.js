// Cálculos puros sobre listas de movimientos. Montos en centavos.

export function periodTotals(transactions) {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (transaction.type === 'income') income += transaction.amount;
    else expense += transaction.amount;
  }
  return { income, expense, balance: income - expense };
}

/** Proporción part / whole, o null si whole es 0 (por ejemplo, un período sin ingresos). */
export const ratio = (part, whole) => (whole > 0 ? part / whole : null);

/** Montos por categoría de un tipo ('income' | 'expense'), de mayor a menor. */
export function totalsByCategory(transactions, type) {
  const totals = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== type) continue;
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + transaction.amount);
  }
  return [...totals]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Deja las primeras `max - 1` filas y suma el resto en una fila con categoryId null ("Otras"). */
export function topWithOther(rows, max) {
  if (rows.length <= max) return rows;
  const rest = rows.slice(max - 1).reduce((sum, row) => sum + row.amount, 0);
  return [...rows.slice(0, max - 1), { categoryId: null, amount: rest }];
}

/** Ingreso fijo vigente: el último registro que empieza antes del fin del período, o null. */
export function fixedIncomeFor(period, incomeRecords) {
  let found = null;
  for (const record of incomeRecords) {
    if (record.start <= period.end) found = record;
  }
  return found;
}

/**
 * Totales del período con el ingreso que se usa como base:
 * el ingreso fijo vigente si existe; si no, la suma de los movimientos de ingreso.
 * incomeRecords debe venir ordenado por fecha de inicio.
 */
export function periodSummary(transactions, period, incomeRecords) {
  const totals = periodTotals(transactions);
  const fixed = fixedIncomeFor(period, incomeRecords);
  const income = fixed ? fixed.amount : totals.income;
  return {
    income,
    expense: totals.expense,
    balance: income - totals.expense,
    movementIncome: totals.income,
    fixed,
    ownFixed: Boolean(fixed && fixed.start >= period.start),
  };
}

/** Resumen de cada período de la lista, en el mismo orden. */
export function periodSeries(transactions, periods, incomeRecords) {
  return periods.map((period) => ({
    period,
    ...periodSummary(
      transactions.filter((t) => t.date >= period.start && t.date <= period.end),
      period,
      incomeRecords
    ),
  }));
}

/**
 * Gastos por medio de pago, en el orden de `methods`; al final, los gastos sin medio (paymentMethodId null).
 * Solo incluye filas con monto.
 */
export function expensesByPaymentMethod(transactions, methods) {
  const totals = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const key = transaction.paymentMethodId ?? null;
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
  }
  return [...methods.map((method) => method.id), null]
    .filter((id) => totals.get(id))
    .map((paymentMethodId) => ({ paymentMethodId, amount: totals.get(paymentMethodId) }));
}
