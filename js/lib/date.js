// Fechas de negocio como strings locales 'YYYY-MM-DD': comparables, ordenables y sin zona horaria.

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const isValidISO = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && toISO(fromISO(value)) === value;

export const todayISO = () => toISO(new Date());

export function addDays(iso, days) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function formatShort(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const longFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function formatLong(iso) {
  const text = longFormat.format(fromISO(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const weekdayFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'narrow' });

export const formatWeekdayNarrow = (iso) => weekdayFormat.format(fromISO(iso)).toUpperCase();

/** Lunes de la semana que contiene la fecha. */
export function startOfWeek(iso) {
  return addDays(iso, -((fromISO(iso).getDay() + 6) % 7));
}

/**
 * Período financiero que contiene la fecha dada.
 * Con startDay = 17: del 17 de un mes al 16 del siguiente, ambos inclusive.
 */
export function periodFor(iso, startDay) {
  const [y, m, d] = iso.split('-').map(Number);
  const startDate = new Date(y, m - 1 - (d < startDay ? 1 : 0), startDay);
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDay - 1);
  const start = toISO(startDate);
  const end = toISO(endDate);
  return { start, end, label: `${formatShort(start)} – ${formatShort(end)}` };
}

export function shiftPeriod(period, offset, startDay) {
  const start = fromISO(period.start);
  return periodFor(toISO(new Date(start.getFullYear(), start.getMonth() + offset, startDay)), startDay);
}

const monthShortFormat = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const monthShort = (iso) => monthShortFormat.format(fromISO(iso)).replace('.', '');

/** Etiqueta corta del período para ejes de gráficos: "oct/nov". */
export function formatPeriodShort(period) {
  const from = monthShort(period.start);
  const to = monthShort(period.end);
  return from === to ? from : `${from}/${to}`;
}

export const inPeriod =(iso, period) => iso >= period.start && iso <= period.end;
