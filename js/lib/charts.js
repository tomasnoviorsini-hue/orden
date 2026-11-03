// Gráficos simples en SVG, sin dependencias. Los colores llegan como valores CSS.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value != null) el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

/**
 * Anillo con 2px de separación entre porciones.
 * slices: [{ value, color, label }]
 * renderCenter(slice | null): nodos para el centro (null = sin porción elegida).
 * Tocar una porción la destaca; tocarla de nuevo vuelve al total.
 */
export function donutChart({ slices, label, renderCenter, size = 200, thickness = 28 }) {
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const gap = slices.length > 1 ? 2 : 0;

  const chart = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'donut', role: 'img', 'aria-label': label });
  const ring = svg('g', { transform: `rotate(-90 ${center} ${center})` });
  chart.append(ring);

  const centerEl = document.createElement('div');
  centerEl.className = 'donut-center';

  let selected = null;
  const arcs = [];

  function update() {
    chart.classList.toggle('has-selection', selected != null);
    arcs.forEach(({ arc, slice }) => arc.classList.toggle('is-selected', slice === selected));
    centerEl.replaceChildren(...renderCenter(selected).filter(Boolean));
  }

  let offset = 0;
  for (const slice of slices) {
    const length = (slice.value / total) * circumference;
    const arc = svg('circle', {
      cx: center,
      cy: center,
      r: radius,
      fill: 'none',
      style: `stroke:${slice.color}`,
      'stroke-width': thickness,
      'stroke-dasharray': `${Math.max(length - gap, 1)} ${circumference}`,
      'stroke-dashoffset': -offset,
      class: 'donut-slice',
    }, svg('title', null, slice.label));
    arc.addEventListener('click', () => {
      selected = selected === slice ? null : slice;
      update();
    });
    ring.append(arc);
    arcs.push({ arc, slice });
    offset += length;
  }

  const wrap = document.createElement('div');
  wrap.className = 'donut-wrap';
  wrap.append(chart, centerEl);
  update();
  return wrap;
}

// Máximo "redondo" del eje para que las marcas caigan en valores legibles.
function niceMax(value) {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  for (const multiplier of [1, 2, 2.5, 5, 10]) {
    if (multiplier * exponent >= value) return multiplier * exponent;
  }
  return 10 * exponent;
}

// Barra con las esquinas superiores redondeadas y la base recta sobre el eje.
function barPath(x, y, width, height, radius) {
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * Barras agrupadas con un único eje Y.
 * groups: [{ label, values: [serie1, serie2, …] }] · colors: un color CSS por serie.
 * formatTick(valor) → texto del eje. onSelect(índice) al tocar (o pasar el mouse por) un grupo.
 */
export function groupedBarChart({ groups, colors, label, formatTick, selectedIndex = groups.length - 1, onSelect }) {
  const W = 340;
  const H = 180;
  const left = 52;
  const right = 4;
  const top = 10;
  const bottom = 24;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const max = niceMax(Math.max(...groups.flatMap((group) => group.values)));
  const y = (value) => top + plotH - (value / max) * plotH;
  const slot = plotW / groups.length;
  const seriesCount = groups[0]?.values.length ?? 1;
  const barW = Math.max(4, Math.min(14, (slot - 14) / seriesCount - 2));

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bar-chart', role: 'img', 'aria-label': label });
  const hitLayer = svg('g');
  const gridLayer = svg('g');
  const barLayer = svg('g');
  const labelLayer = svg('g');
  chart.append(hitLayer, gridLayer, barLayer, labelLayer);

  for (const tick of [0, max / 2, max]) {
    gridLayer.append(
      svg('line', { x1: left, x2: W - right, y1: y(tick), y2: y(tick), class: tick ? 'chart-grid' : 'chart-baseline' }),
      svg('text', { x: left - 6, y: y(tick) + 3, 'text-anchor': 'end', class: 'chart-axis-label' }, formatTick(tick))
    );
  }

  const hits = groups.map((group, i) => {
    const x0 = left + slot * i;
    const groupW = seriesCount * barW + (seriesCount - 1) * 2;

    group.values.forEach((value, j) => {
      const x = x0 + slot / 2 - groupW / 2 + j * (barW + 2);
      const yTop = y(value);
      barLayer.append(svg('path', { d: barPath(x, yTop, barW, y(0) - yTop, 4), style: `fill:${colors[j]}`, class: 'bar' }));
    });

    labelLayer.append(svg('text', { x: x0 + slot / 2, y: H - 6, 'text-anchor': 'middle', class: 'chart-axis-label' }, group.label));

    const hit = svg('rect', { x: x0 + 1, y: 0, width: slot - 2, height: H, rx: 6, class: 'bar-hit' });
    hit.addEventListener('click', () => select(i));
    hit.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') select(i); });
    hitLayer.append(hit);
    return hit;
  });

  function select(index) {
    hits.forEach((hit, i) => hit.classList.toggle('is-selected', i === index));
    onSelect?.(index);
  }

  hits[selectedIndex]?.classList.add('is-selected');
  return chart;
}
