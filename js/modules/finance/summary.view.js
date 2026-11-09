import { h, icon, toast } from '../../lib/ui.js';
import { shiftPeriod, formatPeriodShort, formatShort } from '../../lib/date.js';
import { formatMoney, formatCompactMoney, formatPercent, formatAmountInput, parseARS, CURRENCY_NAMES, DEFAULT_CURRENCY } from '../../lib/money.js';
import { donutChart, groupedBarChart } from '../../lib/charts.js';
import { getCategoryMap } from './categories.repo.js';
import { listByPeriod } from './transactions.repo.js';
import { listPeriodIncomes, setPeriodIncome, removePeriodIncome } from './period-income.repo.js';
import { ratio, totalsByCategory, topWithOther, periodSummary, periodSeries, expensesByPaymentMethod } from './metrics.js';
import { listPaymentMethods } from './payment-methods.repo.js';
import { resolvePeriod, setFinanceAppBar, periodHeader, financeTabs, periodPath, getViewCurrency, currencySwitch } from './period-nav.js';

const HISTORY = 6;
const DONUT_MAX = 6; // porciones del anillo; el resto se agrupa en "Otras"
const FALLBACK_CATEGORY = { name: 'Sin categoría', color: '#8a929c' };
const OTHER = { name: 'Otras', color: '#5c6370' };

// Colores de las series del gráfico de evolución (validados para daltonismo sobre el fondo oscuro).
const SERIES = [
  { name: 'Ingresos', color: 'var(--chart-income)' },
  { name: 'Gastos', color: 'var(--chart-expense)' },
];

const pct = (value) => (value == null ? '—' : formatPercent(value));

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// Moneda de la vista. Se fija en render(); todos los montos de esta pantalla son de esa moneda.
let currency = DEFAULT_CURRENCY;
const money = (cents) => formatMoney(cents, currency);
const moneyCompact = (cents) => formatCompactMoney(cents, currency);
const inCurrency = () => (currency === DEFAULT_CURRENCY ? '' : ` en ${CURRENCY_NAMES[currency].toLowerCase()}`);

/** Diálogo del ingreso fijo. Resuelve { action: 'save', amount } | { action: 'remove' } | null. */
function incomeDialog({ period, amount, canRemove }) {
  return new Promise((resolve) => {
    let result = null;

    const input = h('input', {
      class: 'input input-amount',
      type: 'text',
      inputmode: 'decimal',
      placeholder: '0,00',
      autocomplete: 'off',
      'aria-label': 'Ingreso del período',
      value: amount ? formatAmountInput(amount) : '',
    });
    const error = h('p', { class: 'alert', hidden: true });

    const dialog = h('dialog', { class: 'dialog' },
      h('form', {
        method: 'dialog',
        class: 'stack',
        onsubmit: (event) => {
          const cents = parseARS(input.value);
          if (!cents) {
            event.preventDefault();
            error.textContent = 'Ingrese un monto válido mayor a cero.';
            error.hidden = false;
            return;
          }
          result = { action: 'save', amount: cents };
        },
      },
        h('h2', { class: 'dialog-title' }, `Ingreso del período${inCurrency()}`),
        h('p', { class: 'muted' },
          `${period.label}. Se usa como base de los porcentajes y del saldo, y se mantiene en los períodos siguientes hasta que lo modifique.`),
        input,
        error,
        h('div', { class: 'dialog-actions' },
          canRemove && h('button', {
            class: 'btn btn-danger', type: 'button', style: 'margin-right:auto',
            onclick: () => { result = { action: 'remove' }; dialog.close(); },
          }, 'Quitar'),
          h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancelar'),
          h('button', { class: 'btn btn-primary', value: 'ok' }, 'Guardar')
        )
      )
    );

    dialog.addEventListener('close', () => {
      resolve(result);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}

async function editIncome(summary, period) {
  const result = await incomeDialog({ period, amount: summary.fixed?.amount, canRemove: summary.ownFixed });
  if (!result) return;
  try {
    if (result.action === 'remove') {
      await removePeriodIncome(currency, period);
      toast('Se quitó el ingreso fijo de este período.');
    } else {
      await setPeriodIncome(currency, period, result.amount);
      toast('Ingreso del período guardado.');
    }
  } catch (error) {
    toast(error.message || 'No se pudo guardar el ingreso.');
    return;
  }
  rerender();
}

function incomeBaseCard(summary, period) {
  const { income, fixed, ownFixed, movementIncome } = summary;
  let source;
  if (ownFixed) source = 'Monto fijo cargado para este período.';
  else if (fixed) source = `Monto fijo vigente desde el período que comienza el ${formatShort(fixed.start)}.`;
  else if (movementIncome) source = 'Suma de los ingresos cargados como movimientos. Puede reemplazarla por un monto fijo.';
  else source = 'Todavía no hay un ingreso para este período.';

  return h('div', { class: 'card summary' },
    h('div', { class: 'row' },
      h('span', { class: 'summary-label' }, `Ingreso del período${inCurrency()}`),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => editIncome(summary, period) },
        fixed ? 'Modificar' : 'Cargar ingreso')
    ),
    h('strong', { class: 'summary-balance' }, money(income)),
    h('p', { class: 'muted' }, source)
  );
}

function breakdownRow(category, amount, barShare, meta) {
  return h('li', { class: 'breakdown-row' },
    h('span', { class: 'cat-dot', style: `background:${category.color}` }),
    h('span', null, category.name),
    h('span', { class: 'breakdown-amount' }, money(amount)),
    h('span', { class: 'breakdown-bar' },
      h('span', { style: `width:${Math.min(100, barShare * 100)}%;background:${category.color}` })
    ),
    h('span', { class: 'breakdown-meta' }, meta)
  );
}

function heroCard({ income, expense, balance }) {
  const share = ratio(expense, income);
  const over = expense > income;
  const fill = share == null ? (expense ? 100 : 0) : Math.min(100, share * 100);

  return h('div', { class: 'card stack summary-hero' },
    h('div', null,
      h('span', { class: 'summary-label' }, 'Gastado sobre el ingreso del período'),
      h('strong', { class: 'hero-value' }, pct(share))
    ),
    h('div', {
      class: over ? 'meter is-over' : 'meter',
      role: 'progressbar',
      'aria-label': 'Gastado sobre el ingreso',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': share == null ? null : String(Math.round(share * 100)),
    }, h('span', { class: 'meter-fill', style: `width:${fill}%` })),
    h('p', { class: 'muted' }, income > 0
      ? `Gastó ${money(expense)} de ${money(income)}. Saldo disponible: ${money(balance)}.`
      : 'Cargue el ingreso del período para calcular el porcentaje.'),
    over && h('p', { class: 'alert' }, icon('alert'), 'Los gastos superan al ingreso del período.')
  );
}

function expensesCard(transactions, { income, expense }, categoryOf) {
  const rows = totalsByCategory(transactions, 'expense');
  if (!rows.length) return h('div', { class: 'empty' }, 'No hay gastos en este período.');

  const slices = topWithOther(rows, DONUT_MAX).map(({ categoryId, amount }) => {
    const category = categoryId ? categoryOf(categoryId) : OTHER;
    return { value: amount, color: category.color, label: category.name };
  });

  const donut = donutChart({
    slices,
    label: `Gastos por categoría: ${slices.map((s) => `${s.label} ${money(s.value)}`).join(', ')}`,
    renderCenter: (slice) => (slice
      ? [
          h('span', null, slice.label),
          h('strong', null, money(slice.value)),
          h('span', null, income ? `${pct(ratio(slice.value, income))} del ingreso` : `${pct(slice.value / expense)} de los gastos`),
        ]
      : [
          h('span', null, 'Total gastado'),
          h('strong', null, money(expense)),
          income ? h('span', null, `${pct(ratio(expense, income))} del ingreso`) : null,
        ]),
  });

  // Las barras se miden contra el ingreso; sin ingreso, contra el total gastado.
  const base = income > 0 ? income : expense;
  const list = h('ul', { class: 'breakdown' }, rows.map(({ categoryId, amount }) =>
    breakdownRow(categoryOf(categoryId), amount, amount / base,
      `${pct(ratio(amount, income))} del ingreso · ${pct(amount / expense)} de los gastos`)
  ));

  return h('div', { class: 'card' },
    donut,
    h('p', { class: 'muted chart-hint' }, 'Toque una porción para ver su detalle.'),
    list
  );
}

const NO_METHOD = { name: 'Sin medio de pago', color: '#5c6370' };

function methodsCard(transactions, { income, expense }, methods) {
  const rows = expensesByPaymentMethod(transactions, methods);
  if (!rows.length) return h('div', { class: 'empty' }, 'No hay gastos en este período.');
  const byId = new Map(methods.map((method) => [method.id, method]));
  return h('div', { class: 'card' },
    h('ul', { class: 'breakdown' }, rows.map(({ paymentMethodId, amount }) =>
      breakdownRow(byId.get(paymentMethodId) ?? NO_METHOD, amount, amount / expense,
        `${pct(amount / expense)} de los gastos · ${pct(ratio(amount, income))} del ingreso`)
    ))
  );
}

function incomeMovementsCard(transactions, { fixed, movementIncome }, categoryOf) {
  const rows = totalsByCategory(transactions, 'income');
  if (!rows.length) return h('div', { class: 'empty' }, 'No hay ingresos cargados como movimientos en este período.');

  return h('div', { class: 'card stack' },
    fixed && h('p', { class: 'muted' },
      `Estos ingresos (${money(movementIncome)}) no se suman a la base porque el período tiene un ingreso fijo.`),
    h('ul', { class: 'breakdown' }, rows.map(({ categoryId, amount }) =>
      breakdownRow(categoryOf(categoryId), amount, amount / movementIncome, `${pct(amount / movementIncome)} de estos ingresos`)
    ))
  );
}

function evolutionCard(series, { period, current }) {
  if (series.every((item) => !item.income && !item.expense)) {
    return h('div', { class: 'empty' }, `No hay movimientos en los últimos ${HISTORY} períodos.`);
  }

  const detail = (term, value) => [h('dt', null, term), h('dd', null, value)];
  const panel = h('div', { class: 'chart-panel' });

  function showDetail(index) {
    const item = series[index];
    panel.replaceChildren(
      h('div', { class: 'row' },
        h('strong', null, item.period.label),
        item.period.start !== period.start &&
          h('a', { class: 'link-sm', href: `#/${periodPath('resumen', item.period, current)}` }, 'Ver período')
      ),
      h('dl', { class: 'detail-list' },
        detail(item.fixed ? 'Ingreso (fijo)' : 'Ingresos', money(item.income)),
        detail('Gastos', money(item.expense)),
        detail('Saldo', money(item.balance))
      )
    );
  }

  const chart = groupedBarChart({
    groups: series.map((item) => ({ label: formatPeriodShort(item.period), values: [item.income, item.expense] })),
    colors: SERIES.map((s) => s.color),
    formatTick: moneyCompact,
    label: `Ingresos y gastos de los últimos ${HISTORY} períodos. ${series
      .map((item) => `${item.period.label}: ingresos ${money(item.income)}, gastos ${money(item.expense)}`)
      .join('. ')}`,
    onSelect: showDetail,
  });
  showDetail(series.length - 1);

  const legend = h('div', { class: 'chart-legend' },
    SERIES.map((s) => h('span', null, h('span', { class: 'legend-swatch', style: `background:${s.color}` }), s.name))
  );

  const table = h('details', { class: 'table-toggle' },
    h('summary', null, 'Ver como tabla'),
    h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, h('th', null, 'Período'), h('th', null, 'Ingresos'), h('th', null, 'Gastos'), h('th', null, 'Saldo'))),
      h('tbody', null, [...series].reverse().map((item) =>
        h('tr', null,
          h('td', null, formatPeriodShort(item.period)),
          h('td', null, moneyCompact(item.income)),
          h('td', null, moneyCompact(item.expense)),
          h('td', null, moneyCompact(item.balance))
        )
      ))
    )
  );

  return h('div', { class: 'card' }, legend, chart, panel, table);
}

export async function render(root, startParam) {
  const ctx = await resolvePeriod(startParam);
  currency = getViewCurrency();
  const { period, startDay } = ctx;
  setFinanceAppBar('resumen', ctx);

  const periods = Array.from({ length: HISTORY }, (_, i) => shiftPeriod(period, i - HISTORY + 1, startDay));
  const [allHistory, categories, methods, incomeRecords] = await Promise.all([
    listByPeriod({ start: periods[0].start, end: period.end }),
    getCategoryMap(),
    listPaymentMethods(),
    listPeriodIncomes(currency),
  ]);
  const history = allHistory.filter((t) => t.currency === currency);

  const transactions = history.filter((t) => t.date >= period.start);
  const summary = periodSummary(transactions, period, incomeRecords);
  const categoryOf = (id) => categories.get(id) ?? FALLBACK_CATEGORY;

  root.append(
    periodHeader('resumen', ctx),
    financeTabs('resumen', ctx),
    currencySwitch(currency),
    incomeBaseCard(summary, period),
    heroCard(summary),
    h('h2', { class: 'section-title' }, 'Gastos por categoría'),
    expensesCard(transactions, summary, categoryOf),
    h('h2', { class: 'section-title' }, 'Gastos por medio de pago'),
    methodsCard(transactions, summary, methods),
    h('h2', { class: 'section-title' }, 'Ingresos cargados como movimientos'),
    incomeMovementsCard(transactions, summary, categoryOf),
    h('h2', { class: 'section-title' }, `Últimos ${HISTORY} períodos`),
    evolutionCard(periodSeries(history, periods, incomeRecords), ctx)
  );
}
