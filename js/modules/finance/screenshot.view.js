import { h, icon, setAppBar, toast, confirmDialog } from '../../lib/ui.js';
import { todayISO, isValidISO } from '../../lib/date.js';
import { formatMoney, formatAmountInput, parseARS, CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_NAMES } from '../../lib/money.js';
import { getAll, countByIndex } from '../../db/idb.js';
import { recognizeImage, releaseOcr } from '../../lib/ocr.js';
import { navigate } from '../../router.js';
import { listCategories } from './categories.repo.js';
import { buildClassifier } from './classifier.js';
import { fingerprint, DESCRIPTION_MAX } from './ingest/ingest.js';
import { parseStatementText, saveScreenshotRows } from './ingest/sources/screenshot.js';

// #/finanzas/captura: lee capturas de movimientos con OCR local, sugiere categorías
// y muestra todo para revisar. No se guarda nada sin confirmar.

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function render(root) {
  const [categories, history] = await Promise.all([listCategories(), getAll('transactions')]);
  const classify = buildClassifier(history, categories);
  const categoriesByKind = (kind) => categories.filter((category) => category.kind === kind);

  let alive = true;
  let busy = false;
  const rows = []; // { ...ScreenshotRow, categoryId, source, include, duplicate, el }
  const captures = []; // { name, url, text }

  setAppBar('Cargar captura',
    h('button', {
      class: 'btn btn-icon', type: 'button', 'aria-label': 'Cerrar',
      onclick: () => leave(),
    }, icon('close'))
  );

  async function leave() {
    const pending = rows.some((row) => row.include);
    if (pending && !(await confirmDialog({
      title: '¿Descartar los movimientos detectados?',
      message: 'Todavía no se guardaron.',
      confirmLabel: 'Descartar',
      danger: true,
    }))) return;
    rows.length = 0;
    navigate('finanzas');
  }

  // Selección de imágenes

  const fileInput = h('input', {
    type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      if (files.length) processFiles(files);
    },
  });
  const pickButton = (label, className) =>
    h('button', { class: className, type: 'button', onclick: () => fileInput.click() }, icon('image'), label);

  const intro = h('div', { class: 'card stack' },
    h('p', { class: 'muted' },
      'Elija una o más capturas de pantalla de los movimientos de su banco, billetera o tarjeta. ',
      'El texto se lee en el dispositivo: las imágenes no se envían a ningún lado.'),
    h('p', { class: 'muted' },
      'La primera vez se descarga el lector (unos 6 MB) y se necesita conexión; después funciona sin internet.'),
    pickButton('Elegir capturas', 'btn btn-primary btn-block')
  );

  // Progreso

  const progressLabel = h('span', { class: 'muted' });
  const progressFill = h('span', { class: 'meter-fill', style: 'width:0%' });
  const progressCard = h('div', { class: 'card stack', hidden: true, role: 'status' },
    progressLabel,
    h('div', { class: 'meter' }, progressFill)
  );

  function showProgress(index, total, { label, progress }) {
    const prefix = total > 1 ? `Captura ${index + 1} de ${total} · ` : '';
    progressLabel.textContent = `${prefix}${label}… ${Math.round(progress * 100)} %`;
    progressFill.style.width = `${Math.round(((index + progress) / total) * 100)}%`;
  }

  // Revisión

  const reviewTitle = h('h2', { class: 'section-title' });
  const reviewList = h('div', { class: 'stack' });
  const totals = h('p', { class: 'muted' });
  const saveButton = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: save });
  const capturesBox = h('details', { class: 'table-toggle' }, h('summary', null, 'Ver capturas y texto leído'));
  const review = h('section', { class: 'capture-review', hidden: true },
    reviewTitle,
    h('p', { class: 'muted capture-hint' }, 'Revise cada fila: puede corregir los datos, cambiar la categoría o desmarcar las que no correspondan.'),
    reviewList,
    capturesBox,
    h('div', { class: 'capture-footer stack' },
      totals,
      saveButton,
      pickButton('Agregar otra captura', 'btn btn-block')
    )
  );

  // "$ 1.000 + US$ 20", sin mezclar monedas.
  function sumByCurrency(list) {
    const parts = CURRENCIES
      .map((currency) => [currency, list.filter((row) => row.currency === currency).reduce((sum, row) => sum + (row.amount ?? 0), 0)])
      .filter(([, amount]) => amount);
    return parts.length ? parts.map(([currency, amount]) => formatMoney(amount, currency)).join(' + ') : formatMoney(0);
  }

  function updateSummary() {
    const included = rows.filter((row) => row.include);
    const incomes = included.filter((row) => row.type === 'income');
    reviewTitle.textContent = rows.length === 1 ? '1 movimiento detectado' : `${rows.length} movimientos detectados`;
    totals.textContent = `Seleccionados: ${included.length} · Gastos ${sumByCurrency(included.filter((row) => row.type === 'expense'))}` +
      (incomes.length ? ` · Ingresos ${sumByCurrency(incomes)}` : '');
    saveButton.textContent = included.length === 1 ? 'Guardar 1 movimiento' : `Guardar ${included.length} movimientos`;
    saveButton.disabled = busy || !included.length;
  }

  function categoryOptions(row) {
    return categoriesByKind(row.type).map((category) =>
      h('option', { value: category.id, selected: category.id === row.categoryId }, category.name)
    );
  }

  function rowNotes(row) {
    const notes = [];
    if (row.duplicate) notes.push('Ya está cargado');
    if (row.suspicious) notes.push(row.suspicious);
    if (!row.dateFound) notes.push('Sin fecha en la captura: se usó la de hoy');
    if (!row.source) notes.push('Sin sugerencia de categoría');
    if (row.error) notes.push(row.error);
    return notes;
  }

  function renderRow(row) {
    const notes = h('p', { class: 'capture-notes' });
    const refreshNotes = () => {
      const list = rowNotes(row);
      notes.textContent = list.join(' · ');
      notes.hidden = !list.length;
      notes.classList.toggle('is-error', Boolean(row.error));
      card.classList.toggle('is-excluded', !row.include);
    };

    const dot = h('span', { class: 'cat-dot' });
    const paintDot = () => {
      dot.style.background = categories.find((category) => category.id === row.categoryId)?.color ?? 'transparent';
    };

    const categorySelect = h('select', {
      class: 'input', 'aria-label': 'Categoría',
      onchange: () => { row.categoryId = categorySelect.value; row.source = 'manual'; row.error = null; paintDot(); refreshNotes(); },
    }, categoryOptions(row));

    const typeSelect = h('select', {
      class: 'input', 'aria-label': 'Tipo',
      onchange: () => {
        row.type = typeSelect.value;
        Object.assign(row, classify(row.description, row.type));
        categorySelect.replaceChildren(...categoryOptions(row));
        amountInput.classList.toggle('income', row.type === 'income');
        amountInput.classList.toggle('expense', row.type === 'expense');
        paintDot(); refreshNotes(); updateSummary();
      },
    },
      h('option', { value: 'expense', selected: row.type === 'expense' }, 'Gasto'),
      h('option', { value: 'income', selected: row.type === 'income' }, 'Ingreso')
    );

    const amountInput = h('input', {
      class: `input capture-amount ${row.type}`, type: 'text', inputmode: 'decimal', autocomplete: 'off',
      'aria-label': 'Monto', value: formatAmountInput(row.amount),
      onchange: () => {
        row.amount = parseARS(amountInput.value);
        if (row.amount != null) amountInput.value = formatAmountInput(row.amount);
        row.error = null; refreshNotes(); updateSummary();
      },
    });

    const currencySelect = h('select', {
      class: 'input capture-currency', 'aria-label': 'Moneda',
      onchange: () => { row.currency = currencySelect.value; updateSummary(); },
    }, CURRENCIES.map((currency) =>
      h('option', { value: currency, selected: row.currency === currency, title: CURRENCY_NAMES[currency] }, CURRENCY_SYMBOLS[currency])
    ));

    const descriptionInput = h('input', {
      class: 'input', type: 'text', maxlength: String(DESCRIPTION_MAX), autocomplete: 'off',
      'aria-label': 'Descripción', placeholder: 'Descripción', value: row.description,
      onchange: () => {
        row.description = descriptionInput.value.trim();
        // Si la categoría no la eligió el usuario, se vuelve a sugerir con el texto corregido.
        if (row.source !== 'manual') {
          Object.assign(row, classify(row.description, row.type));
          categorySelect.value = row.categoryId ?? '';
          paintDot(); refreshNotes();
        }
      },
    });

    const dateInput = h('input', {
      class: 'input', type: 'date', 'aria-label': 'Fecha', value: row.date,
      onchange: () => { row.date = dateInput.value; row.dateFound = true; row.error = null; refreshNotes(); },
    });

    const checkbox = h('input', {
      type: 'checkbox', checked: row.include, 'aria-label': 'Incluir este movimiento',
      onchange: () => { row.include = checkbox.checked; refreshNotes(); updateSummary(); },
    });

    const card = h('div', { class: 'card capture-row' },
      h('div', { class: 'capture-line' },
        h('label', { class: 'capture-check' }, checkbox),
        descriptionInput
      ),
      h('div', { class: 'capture-grid' },
        typeSelect,
        h('div', { class: 'capture-money' }, currencySelect, amountInput),
        dateInput,
        h('div', { class: 'capture-category' }, dot, categorySelect)
      ),
      notes
    );
    row.el = card;
    paintDot();
    refreshNotes();
    return card;
  }

  async function addRows(parsed) {
    for (const item of parsed) {
      const row = { ...item, ...classify(item.description, item.type), duplicate: false, error: null };
      row.duplicate = (await countByIndex('transactions', 'fingerprint', fingerprint(row))) > 0 ||
        rows.some((other) => fingerprint(other) === fingerprint(row));
      row.include = !row.duplicate && !row.suspicious;
      rows.push(row);
      reviewList.append(renderRow(row));
    }
  }

  async function processFiles(files) {
    if (busy) return;
    busy = true;
    intro.hidden = true;
    progressCard.hidden = false;
    updateSummary();
    let found = 0;

    for (const [index, file] of files.entries()) {
      if (!alive) return;
      if (!file.type.startsWith('image/') || file.size > MAX_FILE_SIZE) {
        toast(`"${file.name}" no es una imagen válida.`);
        continue;
      }
      showProgress(index, files.length, { label: 'Preparando el lector', progress: 0 });
      try {
        const text = await recognizeImage(file, (state) => alive && showProgress(index, files.length, state));
        if (!alive) return;
        const parsed = parseStatementText(text, todayISO());
        found += parsed.length;
        captures.push({ name: file.name, url: URL.createObjectURL(file), text });
        capturesBox.append(
          h('figure', { class: 'capture-source' },
            h('img', { src: captures.at(-1).url, alt: `Captura ${file.name}`, loading: 'lazy' }),
            h('figcaption', null, h('pre', { class: 'capture-text' }, text.trim() || '(sin texto)'))
          )
        );
        await addRows(parsed);
      } catch (error) {
        console.error(error);
        if (alive) toast(error.message || 'No se pudo leer la captura.', { duration: 5000 });
      }
    }

    if (!alive) return;
    busy = false;
    progressCard.hidden = true;
    if (!rows.length) {
      intro.hidden = false;
      toast('No se encontraron movimientos con monto en la captura.', { duration: 5000 });
    } else {
      review.hidden = false;
      if (!found) toast('No se encontraron movimientos nuevos en esa captura.');
    }
    updateSummary();
  }

  // Guardado

  function validate(row) {
    if (row.amount == null || row.amount <= 0) return 'Revise el monto';
    if (!isValidISO(row.date)) return 'Revise la fecha';
    if (!row.categoryId) return 'Elija una categoría';
    return null;
  }

  async function save() {
    const included = rows.filter((row) => row.include);
    let firstInvalid = null;
    for (const row of included) {
      row.error = validate(row);
      if (row.error) {
        firstInvalid ??= row;
        row.el.querySelector('.capture-notes').textContent = row.error;
        row.el.querySelector('.capture-notes').hidden = false;
        row.el.querySelector('.capture-notes').classList.add('is-error');
      }
    }
    if (firstInvalid) {
      firstInvalid.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast('Hay filas para corregir.');
      return;
    }

    busy = true;
    updateSummary();
    try {
      const names = captures.map((capture) => capture.name).join(', ');
      const { inserted, skipped, errors } = await saveScreenshotRows(included, names || null);
      if (errors.length) throw new Error(errors[0].message);
      const dates = inserted.map((t) => t.date).sort();
      let message = inserted.length === 1 ? 'Se guardó 1 movimiento.' : `Se guardaron ${inserted.length} movimientos.`;
      if (!inserted.length) message = 'Esos movimientos ya estaban cargados.';
      else if (skipped.length) message += ` ${skipped.length === 1 ? '1 ya estaba cargado' : `${skipped.length} ya estaban cargados`}.`;
      rows.length = 0;
      toast(message, { duration: 4000 });
      navigate(dates.length ? `finanzas/periodo/${dates.at(-1)}` : 'finanzas');
    } catch (error) {
      toast(error.message || 'No se pudieron guardar los movimientos.');
      busy = false;
      updateSummary();
    }
  }

  root.append(fileInput, intro, progressCard, review);

  return () => {
    alive = false;
    captures.forEach((capture) => URL.revokeObjectURL(capture.url));
    releaseOcr();
  };
}
