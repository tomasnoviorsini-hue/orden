import { h, icon, setAppBar, toast } from '../../lib/ui.js';
import { todayISO, isValidISO, periodFor } from '../../lib/date.js';
import { formatAmountInput, parseARS, CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_NAMES, DEFAULT_CURRENCY } from '../../lib/money.js';
import { navigate } from '../../router.js';
import { getSettings } from '../settings/settings.repo.js';
import { listCategories } from './categories.repo.js';
import { getTransaction, deleteTransaction, restoreTransaction } from './transactions.repo.js';
import { saveManualTransaction } from './ingest/sources/manual.js';
import { DESCRIPTION_MAX } from './ingest/ingest.js';

const field = (id, label, control) =>
  h('div', { class: 'field' }, h('label', { for: id }, label), control);

export async function render(root, mode, arg) {
  const [{ periodStartDay }, categories, existing] = await Promise.all([
    getSettings(),
    listCategories(),
    mode === 'editar' ? getTransaction(arg) : null,
  ]);

  const current = periodFor(todayISO(), periodStartDay);
  const goToPeriodOf = (date) => {
    const period = periodFor(date, periodStartDay);
    navigate(period.start === current.start ? 'finanzas' : `finanzas/periodo/${period.start}`, { replace: true });
  };

  if (mode === 'editar' && !existing) {
    toast('El movimiento ya no existe.');
    navigate('finanzas', { replace: true });
    return;
  }

  const initialDate = existing?.date ?? (isValidISO(arg) ? arg : todayISO());

  setAppBar(existing ? 'Editar movimiento' : 'Nuevo movimiento',
    h('button', {
      class: 'btn btn-icon', type: 'button', 'aria-label': 'Cerrar',
      onclick: () => goToPeriodOf(initialDate),
    }, icon('close'))
  );

  let type = existing?.type ?? 'expense';
  let categoryId = existing?.categoryId ?? null;
  let currency = existing?.currency ?? DEFAULT_CURRENCY;

  // Tipo

  const typeOption = (value, label) =>
    h('label', { class: `segment segment-${value}` },
      h('input', {
        type: 'radio', name: 'type', value, checked: type === value,
        onchange: () => { type = value; renderCategories(); },
      }),
      label
    );

  const typeToggle = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Tipo de movimiento' },
    typeOption('expense', 'Gasto'),
    typeOption('income', 'Ingreso')
  );

  // Campos

  const currencyToggle = h('div', { class: 'segmented segmented-compact', role: 'radiogroup', 'aria-label': 'Moneda' },
    CURRENCIES.map((value) =>
      h('label', { class: 'segment', title: CURRENCY_NAMES[value] },
        h('input', {
          type: 'radio', name: 'currency', value, checked: currency === value,
          'aria-label': CURRENCY_NAMES[value],
          onchange: () => { currency = value; },
        }),
        CURRENCY_SYMBOLS[value]
      )
    )
  );

  const amountInput = h('input', {
    id: 'amount',
    class: 'input input-amount',
    type: 'text',
    inputmode: 'decimal',
    placeholder: '0,00',
    autocomplete: 'off',
    value: existing ? formatAmountInput(existing.amount) : '',
    onblur: () => {
      const cents = parseARS(amountInput.value);
      if (cents != null) amountInput.value = formatAmountInput(cents);
    },
  });

  const dateInput = h('input', { id: 'date', class: 'input', type: 'date', value: initialDate });

  const descriptionInput = h('input', {
    id: 'description',
    class: 'input',
    type: 'text',
    maxlength: String(DESCRIPTION_MAX),
    autocomplete: 'off',
    placeholder: 'Opcional',
    value: existing?.description ?? '',
  });

  const categoryGroup = h('div', { class: 'chips', role: 'radiogroup', 'aria-labelledby': 'category-label' });

  function renderCategories() {
    const options = categories.filter((category) => category.kind === type);
    if (!options.some((category) => category.id === categoryId)) categoryId = null;
    categoryGroup.replaceChildren(...options.map((category) =>
      h('label', { class: 'chip' },
        h('input', {
          type: 'radio', name: 'category', value: category.id, checked: category.id === categoryId,
          onchange: () => { categoryId = category.id; },
        }),
        h('span', { class: 'cat-dot', style: `background:${category.color}` }),
        category.name
      )
    ));
  }
  renderCategories();

  // Acciones

  const saveButton = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Guardar');

  async function save(event) {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      const saved = await saveManualTransaction({
        type,
        currency,
        amountText: amountInput.value,
        date: dateInput.value,
        categoryId,
        description: descriptionInput.value,
      }, existing?.id);
      toast(existing ? 'Movimiento actualizado.' : 'Movimiento guardado.');
      goToPeriodOf(saved.date);
    } catch (error) {
      toast(error.message || 'No se pudo guardar el movimiento.');
      saveButton.disabled = false;
    }
  }

  async function remove() {
    const deleted = await deleteTransaction(existing.id);
    goToPeriodOf(existing.date);
    if (!deleted) return;
    toast('Movimiento eliminado.', {
      actionLabel: 'Deshacer',
      duration: 5000,
      onAction: async () => {
        await restoreTransaction(deleted);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      },
    });
  }

  root.append(
    h('form', { class: 'stack', novalidate: true, onsubmit: save },
      typeToggle,
      field('amount', 'Monto', h('div', { class: 'amount-row' }, currencyToggle, amountInput)),
      h('div', { class: 'field' },
        h('span', { id: 'category-label', class: 'field-label' }, 'Categoría'),
        categoryGroup,
        h('a', { class: 'link-sm', href: '#/finanzas/categorias' }, 'Administrar categorías')
      ),
      field('date', 'Fecha', dateInput),
      field('description', 'Descripción', descriptionInput),
      saveButton,
      existing && h('button', { class: 'btn btn-danger btn-block', type: 'button', onclick: remove }, 'Eliminar movimiento')
    )
  );

  if (!existing) amountInput.focus();
}
