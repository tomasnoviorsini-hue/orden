import { simplifyText } from './ingest/ingest.js';

// Sugiere la categoría de un movimiento por su descripción.
// 1) Historial: descripciones iguales o con palabras en común con movimientos ya guardados.
//    Cada movimiento confirmado mejora las sugerencias siguientes.
// 2) Reglas fijas para comercios conocidos, según el nombre de la categoría.
// 3) Sin coincidencias: "Otros" / "Otros ingresos".

const STOPWORDS = new Set([
  'del', 'las', 'los', 'con', 'por', 'para', 'pago', 'pagos', 'compra', 'compras', 'transferencia',
  'enviada', 'enviado', 'recibida', 'recibido', 'debito', 'credito', 'tarjeta', 'cuota', 'cuotas',
  'automatico', 'merpago', 'mercadopago', 'mercado', 'www', 'com', 'srl', 'sas', 'visa', 'master',
  'mastercard', 'amex', 'cta', 'cte', 'caja', 'ahorro', 'operacion', 'consumo', 'online', 'app',
]);

// Claves: nombre de la categoría simplificado. Si se renombra la categoría, la regla deja de aplicarse.
const RULES = {
  supermercado: ['carrefour', 'coto', 'dia', 'jumbo', 'disco', 'vea', 'changomas', 'walmart', 'chango', 'supermercado', 'super', 'almacen', 'autoservicio', 'verduleria', 'carniceria', 'dietetica', 'maxiconsumo', 'makro', 'vital', 'diarco'],
  transporte: ['uber', 'cabify', 'didi', 'sube', 'ypf', 'shell', 'axion', 'puma', 'nafta', 'combustible', 'peaje', 'ausol', 'autopista', 'estacionamiento', 'taxi', 'subte', 'tren', 'colectivo'],
  servicios: ['edesur', 'edenor', 'metrogas', 'naturgy', 'aysa', 'telecentro', 'personal', 'movistar', 'claro', 'fibertel', 'flow', 'telefonica', 'internet', 'luz', 'gas', 'agua', 'celular'],
  suscripciones: ['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime', 'youtube', 'google', 'apple', 'icloud', 'chatgpt', 'openai', 'paramount', 'crunchyroll', 'microsoft', 'xbox', 'playstation', 'adobe', 'patreon', 'anthropic', 'claude'],
  salud: ['farmacia', 'farmacity', 'osde', 'swiss', 'galeno', 'medife', 'omint', 'medico', 'clinica', 'sanatorio', 'odontologo', 'laboratorio', 'optica'],
  ocio: ['rappi', 'pedidosya', 'mcdonalds', 'burger', 'cine', 'cinemark', 'hoyts', 'bar', 'restaurant', 'restaurante', 'cafe', 'cafeteria', 'starbucks', 'havanna', 'steam', 'ticketek', 'entradas', 'cerveceria', 'parrilla', 'pizzeria', 'heladeria'],
  ropa: ['zara', 'nike', 'adidas', 'puma', 'dexter', 'grimoldi', 'falabella', 'indumentaria', 'zapatillas', 'calzado'],
  vivienda: ['alquiler', 'expensas', 'abl', 'inmobiliaria', 'easy', 'sodimac', 'ferreteria', 'pintureria'],
  educacion: ['curso', 'universidad', 'facultad', 'udemy', 'coursera', 'colegio', 'escuela', 'instituto', 'libreria', 'cuspide', 'yenny'],
  sueldo: ['sueldo', 'haberes', 'salario', 'remuneracion'],
};

export function tokenize(description) {
  return [...new Set(
    simplifyText(description).split(/[^a-z0-9ñ]+/).filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !STOPWORDS.has(word))
  )];
}

function bump(map, key, categoryId) {
  if (!map.has(key)) map.set(key, new Map());
  const counts = map.get(key);
  counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
}

function best(counts, allowed) {
  let winner = null;
  let max = 0;
  for (const [categoryId, count] of counts ?? []) {
    if (allowed.has(categoryId) && count > max) [winner, max] = [categoryId, count];
  }
  return winner;
}

/**
 * Arma el clasificador con el historial y las categorías activas.
 * classify(description, type) → { categoryId, source: 'historial' | 'regla' | null }
 */
export function buildClassifier(transactions, categories) {
  const exact = new Map();
  const words = new Map();
  for (const transaction of transactions) {
    if (!transaction.description) continue;
    bump(exact, simplifyText(transaction.description), transaction.categoryId);
    for (const word of tokenize(transaction.description)) bump(words, word, transaction.categoryId);
  }

  const byKind = {
    expense: categories.filter((category) => category.kind === 'expense'),
    income: categories.filter((category) => category.kind === 'income'),
  };
  const allowedByKind = {
    expense: new Set(byKind.expense.map((category) => category.id)),
    income: new Set(byKind.income.map((category) => category.id)),
  };
  const byName = new Map(categories.map((category) => [`${category.kind}:${simplifyText(category.name)}`, category.id]));
  const fallback = {
    expense: byName.get('expense:otros') ?? byKind.expense.at(-1)?.id ?? null,
    income: byName.get('income:otros ingresos') ?? byKind.income.at(-1)?.id ?? null,
  };

  return function classify(description, type) {
    const allowed = allowedByKind[type];
    const fromExact = best(exact.get(simplifyText(description)), allowed);
    if (fromExact) return { categoryId: fromExact, source: 'historial' };

    const tokens = tokenize(description);

    // Votos por palabra, ponderados por cuán exclusiva es cada palabra de una categoría.
    const scores = new Map();
    for (const word of tokens) {
      const counts = words.get(word);
      if (!counts) continue;
      const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
      for (const [categoryId, count] of counts) {
        if (allowed.has(categoryId)) scores.set(categoryId, (scores.get(categoryId) ?? 0) + count / total);
      }
    }
    const fromWords = best(scores, allowed);
    if (fromWords && scores.get(fromWords) >= 0.5) return { categoryId: fromWords, source: 'historial' };

    for (const [name, keywords] of Object.entries(RULES)) {
      const categoryId = byName.get(`${type}:${name}`);
      if (categoryId && tokens.some((word) => keywords.includes(word))) return { categoryId, source: 'regla' };
    }

    return { categoryId: fallback[type], source: null };
  };
}
