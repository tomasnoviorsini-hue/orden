import { h, setAppBar } from '../../lib/ui.js';
import { todayISO, fromISO } from '../../lib/date.js';
import { completedDatesByTitle } from './tasks.repo.js';

// #/calendario: un cuadrado por día; celeste los días en que se completó la tarea "Entrenar"
// (sin importar mayúsculas, tildes ni espacios). Año actual primero.

const TRAINING_TITLE = 'entrenar';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = (n) => String(n).padStart(2, '0');
const daysText = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

function monthGrid(year, month, trained, today) {
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // semanas de lunes a domingo
  let count = 0;

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(h('span', { class: 'cal-day is-blank' }));
  for (let day = 1; day <= days; day++) {
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    const done = trained.has(iso);
    if (done) count++;
    const classes = ['cal-day', done && 'is-done', iso > today && 'is-future', iso === today && 'is-today'];
    cells.push(h('span', { class: classes.filter(Boolean).join(' '), title: `${day}/${month + 1}${done ? ' · Entrenó' : ''}` }));
  }

  return h('div', { class: 'cal-month' },
    h('span', { class: 'cal-month-name' }, MONTHS[month]),
    h('div', {
      class: 'cal-grid',
      role: 'img',
      'aria-label': `${MONTH_NAMES[month]} de ${year}: ${daysText(count)} de entrenamiento`,
    }, cells)
  );
}

function yearSection(year, trained, today) {
  const count = [...trained].filter((date) => date.startsWith(`${year}-`)).length;
  return h('section', { class: 'cal-year' },
    h('div', { class: 'cal-year-header' },
      h('h2', null, String(year)),
      h('span', { class: 'muted' }, `${daysText(count)} de entrenamiento`)
    ),
    h('div', { class: 'cal-months' }, MONTHS.map((_, month) => monthGrid(year, month, trained, today)))
  );
}

export async function render(root) {
  setAppBar('Calendario');
  const today = todayISO();
  const trained = await completedDatesByTitle(TRAINING_TITLE);

  const currentYear = fromISO(today).getFullYear();
  const firstYear = Math.min(currentYear, ...[...trained].map((date) => Number(date.slice(0, 4))));
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i);

  root.append(
    h('div', { class: 'card cal-intro' },
      h('span', { class: 'cal-day is-done', 'aria-hidden': 'true' }),
      h('p', { class: 'muted' }, 'Días en que completó la tarea "Entrenar".')
    ),
    ...years.map((year) => yearSection(year, trained, today))
  );
}
