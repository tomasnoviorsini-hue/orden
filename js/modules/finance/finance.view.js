import { h, icon } from '../../lib/ui.js';
import { formatLong } from '../../lib/date.js';
import { formatMoney, CURRENCIES, CURRENCY_NAMES } from '../../lib/money.js';
import { getCategoryMap } from './categories.repo.js';
import { listByPeriod } from './transactions.repo.js';
import { listPeriodIncomes } from './period-income.repo.js';
import { periodSummary, expensesByPaymentMethod } from './metrics.js';
import { listPaymentMethods, getPaymentMethodMap } from './payment-methods.repo.js';
import { resolvePeriod, setFinanceAppBar, periodHeader, financeTabs } from './period-nav.js';

// Rutas del módulo:
//   #/finanzas                     movimientos del período actual
//   #/finanzas/periodo/AAAA-MM-DD  movimientos del período que contiene esa fecha
//   #/finanzas/resumen[/AAAA-MM-DD] métricas y gráficos del período
//   #/finanzas/nuevo[/AAAA-MM-DD]  alta (fecha sugerida opcional)
//   #/finanzas/editar/<id>         edición
//   #/finanzas/categorias          administración de categorías
//   #/finanzas/captura             carga desde capturas de pantalla (OCR)
export async function render(root, [section, arg]) {
  if (section === 'captura') {
    return (await import('./screenshot.view.js')).render(root);
  }
  if (section === 'nuevo' || section === 'editar') {
    return (await import('./transaction-form.view.js')).render(root, section, arg);
  }
  if (section === 'categorias') {
    return (await import('./categories.view.js')).render(root);
  }
  if (section === 'resumen') {
    return (await import('./summary.view.js')).render(root, arg);
  }
  return renderMovements(root, section === 'periodo' ? arg : null);
}

const FALLBACK_CATEGORY = { name: 'Sin categoría', color: '#8a929c' };
const NO_METHOD = { name: 'Sin medio de pago', color: '#5c6370' };

function movementItem(transaction, categories, methods) {
  const category = categories.get(transaction.categoryId) ?? FALLBACK_CATEGORY;
  const method = transaction.type === 'expense' ? methods.get(transaction.paymentMethodId) : null;
  const detail = [method?.name, transaction.description].filter(Boolean).join(' · ');
  const sign = transaction.type === 'income' ? '+' : '−';
  return h('li', null,
    h('a', { class: 'movement', href: `#/finanzas/editar/${transaction.id}` },
      h('span', { class: 'cat-dot', style: `background:${category.color}` }),
      h('span', { class: 'movement-main' },
        h('span', null, category.name),
        detail && h('span', { class: 'muted movement-desc' }, detail)
      ),
      h('span', { class: `movement-amount ${transaction.type}` }, `${sign} ${formatMoney(transaction.amount, transaction.currency)}`)
    )
  );
}

function summaryCard(currency, { income, expense, balance, fixed }, byMethod, methods, labelled) {
  const money = (cents) => formatMoney(cents, currency);
  return h('div', { class: 'card summary' },
    h('span', { class: 'summary-label' }, labelled ? `Saldo disponible en ${CURRENCY_NAMES[currency].toLowerCase()}` : 'Saldo disponible'),
    h('strong', { class: balance < 0 ? 'summary-balance expense' : 'summary-balance' }, money(balance)),
    h('div', { class: 'summary-row' },
      h('div', null,
        h('span', { class: 'summary-label' }, fixed ? 'Ingreso del período' : 'Ingresos'),
        h('span', { class: 'summary-value income' }, money(income))
      ),
      h('div', null,
        h('span', { class: 'summary-label' }, 'Gastos'),
        h('span', { class: 'summary-value expense' }, money(expense))
      )
    ),
    byMethod.length > 0 && h('dl', { class: 'detail-list method-totals', 'aria-label': 'Gastos por medio de pago' },
      byMethod.flatMap(({ paymentMethodId, amount }) => {
        const method = methods.get(paymentMethodId) ?? NO_METHOD;
        return [
          h('dt', null, h('span', { class: 'cat-dot', style: `background:${method.color}` }), method.name),
          h('dd', null, money(amount)),
        ];
      })
    )
  );
}

// Apartados de la lista: todos, un medio de pago, gastos sin medio o ingresos.
const FILTER_ALL = 'todos';
const FILTER_NONE = 'sin-medio';
const FILTER_INCOME = 'ingresos';

function matchesFilter(transaction, filter) {
  if (filter === FILTER_ALL) return true;
  if (filter === FILTER_INCOME) return transaction.type === 'income';
  if (transaction.type !== 'expense') return false;
  return filter === FILTER_NONE ? !transaction.paymentMethodId : transaction.paymentMethodId === filter;
}

function filterTotal(items) {
  return CURRENCIES
    .map((currency) => [currency, items.filter((t) => t.currency === currency).reduce((sum, t) => sum + t.amount, 0)])
    .filter(([, amount]) => amount)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' + ');
}

async function renderMovements(root, startParam) {
  const ctx = await resolvePeriod(startParam);
  const { period, isCurrent } = ctx;
  setFinanceAppBar('movimientos', ctx);

  const [transactions, categories, methodList, methods, ...incomeRecords] = await Promise.all([
    listByPeriod(period),
    getCategoryMap(),
    listPaymentMethods(),
    getPaymentMethodMap(),
    ...CURRENCIES.map((currency) => listPeriodIncomes(currency)),
  ]);

  // Un resumen por moneda, sin convertir. Los pesos siempre se muestran; las demás, si tienen datos.
  const summaries = CURRENCIES.map((currency, i) => {
    const own = transactions.filter((t) => t.currency === currency);
    const summary = periodSummary(own, period, incomeRecords[i]);
    const show = i === 0 || own.length > 0 || summary.fixed;
    return show && summaryCard(currency, summary, expensesByPaymentMethod(own, methodList), methods, i > 0);
  });

  const hasUnassigned = transactions.some((t) => t.type === 'expense' && !t.paymentMethodId);
  const filters = [
    [FILTER_ALL, 'Todos'],
    ...methodList.map((method) => [method.id, method.name]),
    hasUnassigned && [FILTER_NONE, 'Sin medio'],
    [FILTER_INCOME, 'Ingresos'],
  ].filter(Boolean);
  let filter = FILTER_ALL;

  const listRoot = h('div');

  function renderList() {
    const items = transactions.filter((t) => matchesFilter(t, filter));
    const groups = new Map();
    for (const transaction of items) {
      if (!groups.has(transaction.date)) groups.set(transaction.date, []);
      groups.get(transaction.date).push(transaction);
    }
    const label = filters.find(([value]) => value === filter)[1];
    listRoot.replaceChildren(
      filter !== FILTER_ALL && items.length > 0
        ? h('p', { class: 'muted filter-total' }, `${label}: ${filterTotal(items)}`)
        : '',
      items.length
        ? h('div', { class: 'stack' }, [...groups].map(([date, dayItems]) =>
            h('section', null,
              h('h3', { class: 'group-title' }, formatLong(date)),
              h('ul', { class: 'list card card-flush movement-list' }, dayItems.map((t) => movementItem(t, categories, methods)))
            )
          ))
        : h('div', { class: 'empty' }, filter === FILTER_ALL ? 'No hay movimientos en este período.' : `No hay movimientos en "${label}" en este período.`)
    );
  }

  const filterBar = h('div', { class: 'chips filter-chips', role: 'radiogroup', 'aria-label': 'Apartado' },
    filters.map(([value, label]) =>
      h('label', { class: 'chip' },
        h('input', {
          type: 'radio', name: 'movement-filter', value, checked: value === filter,
          onchange: () => { filter = value; renderList(); },
        }),
        label
      )
    )
  );
  renderList();

  const fab = h('a', {
    class: 'fab',
    href: isCurrent ? '#/finanzas/nuevo' : `#/finanzas/nuevo/${period.end}`,
    'aria-label': 'Agregar movimiento',
  }, icon('plus'));

  root.append(
    periodHeader('movimientos', ctx),
    financeTabs('movimientos', ctx),
    ...summaries.filter(Boolean),
    h('h2', { class: 'section-title' }, 'Movimientos'),
    transactions.length > 0 ? filterBar : '',
    listRoot,
    h('div', { class: 'fab-spacer' }),
    fab
  );
}
