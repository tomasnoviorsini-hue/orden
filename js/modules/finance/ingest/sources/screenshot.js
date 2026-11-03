import { fromISO, addDays, isValidISO } from '../../../../lib/date.js';
import { ingest, simplifyText } from '../ingest.js';

// Fuente "captura": texto leído por OCR → filas candidatas → (revisión del usuario) → ingest().
//
//   ScreenshotRow = {
//     description: string,
//     amount: number,              // centavos
//     currency: 'ARS' | 'USD',
//     type: 'income' | 'expense',
//     date: 'YYYY-MM-DD',
//     dateFound: boolean,          // false: no había fecha en la captura y se usó la de hoy
//     suspicious: string | null,   // motivo para dejarla desmarcada (saldo, total…)
//   }

const SIGN = '[+\\-−–]';
// Con "$": admite separador de miles con punto o espacio (el OCR a veces cambia uno por otro).
// "US$", "U$S" y "USD" marcan dólares.
const AMOUNT_WITH_SYMBOL = `(${SIGN})?\\s*(?:(US\\$|U\\$S|USD)|\\$|ARS)\\s*(${SIGN})?\\s*(\\d{1,3}(?:[. ]\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)(?![\\d.,])`;
// Sin "$": solo números con decimales, para no confundir fechas, horas o números de tarjeta.
const AMOUNT_PLAIN = `(${SIGN})?\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})(?![\\d,])`;
const AMOUNT_RE = new RegExp(`${AMOUNT_WITH_SYMBOL}|${AMOUNT_PLAIN}`, 'i');

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const NUMERIC_DATE_RE = /(?<![\d.,])(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}|\d{2}))?(?![\d,]|\.\d)/;
const TEXT_DATE_RE = /\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s+|del\s+)?(\d{4}))?/i;
const WEEKDAYS_RE = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b,?/gi;
// "Cuota 1/3" no es una fecha.
const INSTALLMENT_RE = /cuotas?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/gi;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:hs?\b|am\b|pm\b)?/gi;

const INCOME_WORDS = /\b(recibid[oa]s?|ingreso|acreditaci[oó]n|acreditad[oa]|sueldo|haberes|devoluci[oó]n|reintegro|reembolso|cobro|cobraste|te (?:envi[oó]|pag[oó]|transfiri[oó])|rendimientos?)\b/i;
const SUSPICIOUS_WORDS = /\b(saldo|disponible|total|l[ií]mite|consumos del|resumen|vencimiento|pago m[ií]nimo)\b/i;
// Líneas de interfaz que no son descripciones de movimientos.
const NOISE_WORDS = /^(movimientos|actividad|[uú]ltimos movimientos|ver (todo|m[aá]s)|inicio|tarjetas?|cuentas?|filtrar|buscar|hoy|ayer)$/i;

function parseAmount(match) {
  const [, signA, usd, signB, symbolDigits, plainSign, plainDigits] = match;
  const digits = symbolDigits ?? plainDigits;
  const [integer, decimals = ''] = digits.replace(/[. ]/g, '').split(',');
  const amount = Number(integer) * 100 + Number(decimals.padEnd(2, '0'));
  const sign = signA ?? signB ?? plainSign ?? null;
  return { amount, currency: usd ? 'USD' : 'ARS', sign: sign ? (sign === '+' ? '+' : '-') : null };
}

function validDate(year, month, day) {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidISO(iso) ? iso : null;
}

/** Sin año: el más reciente que no quede en el futuro. */
function withYear(month, day, year, today) {
  if (year) return validDate(year < 100 ? 2000 + year : year, month, day);
  const current = fromISO(today).getFullYear();
  const guess = validDate(current, month, day);
  return guess && guess > addDays(today, 1) ? validDate(current - 1, month, day) : guess;
}

const removeAt = (line, match) => `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}`;
const blank = (text) => ' '.repeat(text.length);

/** Busca una fecha en la línea. Devuelve { date, rest } o null. */
function extractDate(line, today) {
  // Se busca en una copia con cuotas y horas tapadas (mismo largo, para recortar el original).
  const masked = line.replace(INSTALLMENT_RE, blank).replace(TIME_RE, blank);
  const text = TEXT_DATE_RE.exec(masked);
  if (text) {
    const date = withYear(MONTHS[text[2].toLowerCase()], Number(text[1]), text[3] && Number(text[3]), today);
    if (date) return { date, rest: removeAt(line, text) };
  }
  const numeric = NUMERIC_DATE_RE.exec(masked);
  if (numeric) {
    const date = withYear(Number(numeric[2]), Number(numeric[1]), numeric[3] && Number(numeric[3]), today);
    if (date) return { date, rest: removeAt(line, numeric) };
  }
  const word = simplifyText(line).match(/^(hoy|ayer|anteayer)\b/);
  if (word) {
    const offset = { hoy: 0, ayer: -1, anteayer: -2 }[word[1]];
    return { date: addDays(today, offset), rest: line.slice(word[0].length) };
  }
  return null;
}

function cleanDescription(text) {
  return text
    .replace(TIME_RE, ' ')
    .replace(WEEKDAYS_RE, ' ')
    .replace(/[|•·›»>_~=*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—,.:;]+|[\s\-–—,.:;]+$/g, '')
    .trim();
}

const letterCount = (text) => (text.match(/\p{L}/gu) ?? []).length;

/**
 * Convierte el texto de una captura de movimientos (home banking, billetera, tarjeta)
 * en filas candidatas. Es heurístico: la pantalla de revisión permite corregir todo.
 */
export function parseStatementText(text, today) {
  const rows = [];
  let currentDate = null;
  let pendingDescription = '';
  let lastRow = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const amountMatch = AMOUNT_RE.exec(line);
    if (amountMatch) line = line.replace(amountMatch[0], ' ');

    const found = extractDate(line, today);
    if (found) {
      line = found.rest;
      currentDate = found.date;
    }

    const description = cleanDescription(line);

    if (!amountMatch) {
      if (letterCount(description) < 3 || NOISE_WORDS.test(description)) continue;
      // Un subtítulo como "Transferencia recibida" debajo de una fila define su tipo.
      if (lastRow && !lastRow.signFound && INCOME_WORDS.test(description)) lastRow.type = 'income';
      pendingDescription = description;
      lastRow = null;
      continue;
    }

    const { amount, currency, sign } = parseAmount(amountMatch);
    if (amount <= 0) continue;

    const finalDescription = letterCount(description) >= 2 ? description : pendingDescription;
    const type = sign === '+' || (!sign && INCOME_WORDS.test(finalDescription)) ? 'income' : 'expense';

    lastRow = {
      description: finalDescription,
      amount,
      currency,
      type,
      date: currentDate ?? today,
      dateFound: Boolean(currentDate),
      suspicious: SUSPICIOUS_WORDS.test(finalDescription) ? 'Parece un saldo o un total' : null,
      signFound: Boolean(sign),
    };
    rows.push(lastRow);
    pendingDescription = '';
  }

  return rows.map(({ signFound, ...row }) => row);
}

/** Guarda las filas confirmadas. Los movimientos que ya existían (misma huella) se omiten. */
export function saveScreenshotRows(rows, fileName) {
  return ingest(
    rows.map(({ type, currency, amount, date, categoryId, description }) => ({ type, currency, amount, date, categoryId, description })),
    { kind: 'screenshot', fileName }
  );
}
