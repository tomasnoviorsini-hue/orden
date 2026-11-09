import { h, icon, setAppBar, toast, confirmDialog } from '../../lib/ui.js';
import { navigate } from '../../router.js';
import {
  listCategories, usageCounts, createCategory, updateCategory, deleteCategory,
  CATEGORY_COLORS, NAME_MAX,
} from './categories.repo.js';
import {
  listPaymentMethods, paymentMethodUsage, createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
} from './payment-methods.repo.js';

const SECTIONS = [
  { kind: 'expense', title: 'Categorías de gastos', addLabel: 'Agregar categoría de gasto' },
  { kind: 'income', title: 'Categorías de ingresos', addLabel: 'Agregar categoría de ingreso' },
];

const movementsText = (count) => {
  if (!count) return 'Sin movimientos';
  return `${count} ${count === 1 ? 'movimiento' : 'movimientos'}`;
};

/** Diálogo de nombre y color. Resuelve con { name, color } o null si se cancela. */
function categoryDialog({ title, name = '', color }) {
  return new Promise((resolve) => {
    const input = h('input', {
      class: 'input',
      type: 'text',
      value: name,
      maxlength: String(NAME_MAX),
      required: true,
      autocomplete: 'off',
      placeholder: 'Nombre',
      'aria-label': 'Nombre',
    });

    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' },
      CATEGORY_COLORS.map((value) =>
        h('label', { class: 'swatch', style: `background:${value}` },
          h('input', { type: 'radio', name: 'color', value, checked: value === color, 'aria-label': `Color ${value}` })
        )
      )
    );

    const dialog = h('dialog', { class: 'dialog' },
      h('form', { method: 'dialog', class: 'stack' },
        h('h2', { class: 'dialog-title' }, title),
        input,
        swatches,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => dialog.close('cancel') }, 'Cancelar'),
          h('button', { class: 'btn btn-primary', value: 'ok' }, 'Guardar')
        )
      )
    );

    dialog.addEventListener('close', () => {
      const picked = swatches.querySelector('input:checked')?.value ?? color;
      resolve(dialog.returnValue === 'ok' ? { name: input.value, color: picked } : null);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}

export async function render(root) {
  setAppBar('Categorías y medios',
    h('button', {
      class: 'btn btn-icon', type: 'button', 'aria-label': 'Volver a finanzas',
      onclick: () => navigate('finanzas'),
    }, icon('close'))
  );

  async function run(action) {
    try {
      await action();
    } catch (error) {
      toast(error.message || 'Ocurrió un error.');
    }
    await refresh();
  }

  async function add(kind, existing) {
    const used = new Set(existing.map((category) => category.color));
    const color = CATEGORY_COLORS.find((value) => !used.has(value)) ?? CATEGORY_COLORS[0];
    const values = await categoryDialog({ title: 'Nueva categoría', color });
    if (values) run(() => createCategory({ kind, ...values }));
  }

  async function edit(category) {
    const values = await categoryDialog({ title: 'Editar categoría', name: category.name, color: category.color });
    if (values) run(() => updateCategory(category.id, values));
  }

  async function remove(category, used) {
    if (used) {
      toast(`No se puede eliminar "${category.name}": tiene ${movementsText(used).toLowerCase()}.`);
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Eliminar categoría',
      message: `¿Desea eliminar la categoría "${category.name}"?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (confirmed) run(() => deleteCategory(category.id));
  }

  // Medios de pago: mismo diálogo y mismas reglas que las categorías.

  async function addMethod(existing) {
    const used = new Set(existing.map((method) => method.color));
    const color = CATEGORY_COLORS.find((value) => !used.has(value)) ?? CATEGORY_COLORS[0];
    const values = await categoryDialog({ title: 'Nuevo medio de pago', color });
    if (values) run(() => createPaymentMethod(values));
  }

  async function editMethod(method) {
    const values = await categoryDialog({ title: 'Editar medio de pago', name: method.name, color: method.color });
    if (values) run(() => updatePaymentMethod(method.id, values));
  }

  async function removeMethod(method, used) {
    if (used) {
      toast(`No se puede eliminar "${method.name}": tiene ${movementsText(used).toLowerCase()}.`);
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Eliminar medio de pago',
      message: `¿Desea eliminar el medio de pago "${method.name}"?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (confirmed) run(() => deletePaymentMethod(method.id));
  }

  function methodItem(method, used) {
    return h('li', { class: 'list-item' },
      h('span', { class: 'cat-dot', style: `background:${method.color}` }),
      h('span', { class: 'category-main' },
        h('span', null, method.name),
        h('span', { class: 'muted' }, movementsText(used))
      ),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': `Editar ${method.name}`, onclick: () => editMethod(method) }, icon('edit')),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': `Eliminar ${method.name}`, onclick: () => removeMethod(method, used) }, icon('trash'))
    );
  }

  function categoryItem(category, used) {
    return h('li', { class: 'list-item' },
      h('span', { class: 'cat-dot', style: `background:${category.color}` }),
      h('span', { class: 'category-main' },
        h('span', null, category.name),
        h('span', { class: 'muted' }, movementsText(used))
      ),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': `Editar ${category.name}`, onclick: () => edit(category) }, icon('edit')),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': `Eliminar ${category.name}`, onclick: () => remove(category, used) }, icon('trash'))
    );
  }

  async function refresh() {
    const [categories, methods] = await Promise.all([listCategories(), listPaymentMethods()]);
    const [usage, methodUsage] = await Promise.all([usageCounts(categories), paymentMethodUsage(methods)]);
    const methodSection = [
      h('h2', { class: 'section-title' }, 'Medios de pago'),
      h('p', { class: 'muted capture-hint' }, 'Se eligen al cargar un gasto y separan los gastos en Movimientos y Resumen.'),
      h('ul', { class: 'list card card-flush' }, methods.map((method) => methodItem(method, methodUsage.get(method.id) ?? 0))),
      h('button', { class: 'btn btn-block add-category', type: 'button', onclick: () => addMethod(methods) }, icon('plus'), 'Agregar medio de pago'),
    ];
    root.replaceChildren(...SECTIONS.flatMap(({ kind, title, addLabel }) => {
      const ofKind = categories.filter((category) => category.kind === kind);
      return [
        h('h2', { class: 'section-title' }, title),
        h('ul', { class: 'list card card-flush' }, ofKind.map((category) => categoryItem(category, usage.get(category.id) ?? 0))),
        h('button', { class: 'btn btn-block add-category', type: 'button', onclick: () => add(kind, ofKind) }, icon('plus'), addLabel),
      ];
    }), ...methodSection);
  }

  await refresh();
}
