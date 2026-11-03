import { h, icon, setAppBar } from '../../lib/ui.js';
import { todayISO, isValidISO, periodFor, shiftPeriod } from '../../lib/date.js';
import { navigate } from '../../router.js';
import { getSettings } from '../settings/settings.repo.js';

// Navegación entre períodos compartida por las pestañas Movimientos y Resumen.
// view: 'movimientos' | 'resumen'

/** Período pedido por la URL (o el actual) y datos para navegar. */
export async function resolvePeriod(startParam) {
  const { periodStartDay } = await getSettings();
  const current = periodFor(todayISO(), periodStartDay);
  const period = isValidISO(startParam) ? periodFor(startParam, periodStartDay) : current;
  return { period, current, startDay: periodStartDay, isCurrent: period.start === current.start };
}

export function periodPath(view, period, current) {
  const isCurrent = period.start === current.start;
  if (view === 'resumen') return isCurrent ? 'finanzas/resumen' : `finanzas/resumen/${period.start}`;
  return isCurrent ? 'finanzas' : `finanzas/periodo/${period.start}`;
}

export function setFinanceAppBar(view, { current, isCurrent }) {
  setAppBar('Finanzas',
    !isCurrent && h('button', {
      class: 'btn btn-sm', type: 'button',
      onclick: () => navigate(periodPath(view, current, current)),
    }, 'Ir al actual'),
    h('button', {
      class: 'btn btn-icon', type: 'button', 'aria-label': 'Categorías',
      onclick: () => navigate('finanzas/categorias'),
    }, icon('tag'))
  );
}

export function periodHeader(view, { period, current, startDay, isCurrent }) {
  const go = (offset) => navigate(periodPath(view, shiftPeriod(period, offset, startDay), current));
  return h('div', { class: 'card daynav' },
    h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Período anterior', onclick: () => go(-1) }, icon('chevron-left')),
    h('div', { class: 'daynav-label is-static' },
      h('strong', null, isCurrent ? 'Período actual' : 'Período'),
      h('span', { class: 'muted' }, period.label)
    ),
    h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Período siguiente', onclick: () => go(1) }, icon('chevron-right'))
  );
}

export function financeTabs(view, { period, current }) {
  const tab = (target, label) => h('a', {
    class: 'tab',
    href: `#/${periodPath(target, period, current)}`,
    'aria-current': view === target ? 'page' : null,
  }, label);
  return h('nav', { class: 'tabs', 'aria-label': 'Vista de finanzas' },
    tab('movimientos', 'Movimientos'),
    tab('resumen', 'Resumen')
  );
}
