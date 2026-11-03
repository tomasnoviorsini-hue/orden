// Montos siempre en centavos enteros. Solo se convierten a texto para mostrar.
// Cada movimiento tiene su moneda; los totales nunca mezclan monedas.

export const CURRENCIES = ['ARS', 'USD'];
export const DEFAULT_CURRENCY = 'ARS';
export const CURRENCY_NAMES = { ARS: 'Pesos', USD: 'Dólares' };
export const CURRENCY_SYMBOLS = { ARS: '$', USD: 'US$' };

export const isCurrency = (value) => CURRENCIES.includes(value);

const formatters = Object.fromEntries(CURRENCIES.map((currency) =>
  [currency, new Intl.NumberFormat('es-AR', { style: 'currency', currency })]
));

/** "$ 1.234,56" o "US$ 1.234,56". */
export const formatMoney = (cents, currency = DEFAULT_CURRENCY) => formatters[currency].format(cents / 100);

export const formatARS = (cents) => formatMoney(cents, 'ARS');

const amountFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos a texto editable, sin símbolo: 123456 → "1.234,56". */
export const formatAmountInput = (cents) => amountFormatter.format(cents / 100);

const compactFormatter = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

/** Formato corto para ejes y tablas angostas: "$ 850 mil", "US$ 1,2 mil". */
export const formatCompactMoney = (cents, currency = DEFAULT_CURRENCY) =>
  `${cents < 0 ? '-' : ''}${CURRENCY_SYMBOLS[currency]} ${compactFormatter.format(Math.abs(cents) / 100)}`;

/**
 * Convierte lo que se escribe en un campo a centavos.
 * Acepta "1.234,56", "1234,56", "1234.56", "1.234" (miles), "$ 1.234" y "US$ 1.234".
 * Devuelve null si no es un monto válido.
 */
export function parseARS(input) {
  let s = String(input ?? '').replace(/US\$|U\$S|USD|ARS/gi, '').replace(/[\s$ ]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function formatPercent(value) {
  return new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}
