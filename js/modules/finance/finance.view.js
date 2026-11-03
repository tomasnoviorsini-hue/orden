import { h, icon } from '../../lib/ui.js';
import { formatLong } from '../../lib/date.js';
import { formatARS } from '../../lib/money.js';
import { getCategoryMap } from './categories.repo.js';
import { listByPeriod } from './transactions.repo.js';
import { listPeriodIncomes } from './period-income.repo.js';
import { periodSummary } from './metrics.js';
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

function movementItem(transaction, categories) {
  const category = categories.get(transaction.categoryId) ?? FALLBACK_CATEGORY;
  const sign = transaction.type === 'income' ? '+' : '−';
  return h('li', null,
    h('a', { class: 'movement', href: `#/finanzas/editar/${transaction.id}` },
      h('span', { class: 'cat-dot', style: `background:${category.color}` }),
      h('span', { class: 'movement-main' },
        h('span', null, category.name),
        transaction.description && h('span', { class: 'muted movement-desc' }, transaction.description)
      ),
      h('span', { class: `movement-amount ${transaction.type}` }, `${sign} ${formatARS(transaction.amount)}`)
    )
  );
}

async function renderMovements(root, startParam) {
  const ctx = await resolvePeriod(startParam);
  const { period, isCurrent } = ctx;
  setFinanceAppBar('movimientos', ctx);

  const [transactions, categories, incomeRecords] = await Promise.all([
    listByPeriod(period),
    getCategoryMap(),
    listPeriodIncomes(),
  ]);
  const { income, expense, balance, fixed } = periodSummary(transactions, period, incomeRecords);

  const summary = h('div', { class: 'card summary' },
    h('span', { class: 'summary-label' }, 'Saldo disponible'),
    h('strong', { class: balance < 0 ? 'summary-balance expense' : 'summary-balance' }, formatARS(balance)),
    h('div', { class: 'summary-row' },
      h('div', null,
        h('span', { class: 'summary-label' }, fixed ? 'Ingreso del período' : 'Ingresos'),
        h('span', { class: 'summary-value income' }, formatARS(income))
      ),
      h('div', null,
        h('span', { class: 'summary-label' }, 'Gastos'),
        h('span', { class: 'summary-value expense' }, formatARS(expense))
      )
    )
  );

  const groups = new Map();
  for (const transaction of transactions) {
    if (!groups.has(transaction.date)) groups.set(transaction.date, []);
    groups.get(transaction.date).push(transaction);
  }

  const movements = transactions.length
    ? h('div', { class: 'stack' }, [...groups].map(([date, items]) =>
        h('section', null,
          h('h3', { class: 'group-title' }, formatLong(date)),
          h('ul', { class: 'list card card-flush movement-list' }, items.map((t) => movementItem(t, categories)))
        )
      ))
    : h('div', { class: 'empty' }, 'No hay movimientos en este período.');

  const fab = h('a', {
    class: 'fab',
    href: isCurrent ? '#/finanzas/nuevo' : `#/finanzas/nuevo/${period.end}`,
    'aria-label': 'Agregar movimiento',
  }, icon('plus'));

  root.append(
    periodHeader('movimientos', ctx),
    financeTabs('movimientos', ctx),
    summary,
    h('h2', { class: 'section-title' }, 'Movimientos'),
    movements,
    h('div', { class: 'fab-spacer' }),
    fab
  );
}
