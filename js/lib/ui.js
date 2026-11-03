const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'selected', 'disabled']);

const flatten = (children) =>
  children.flat(Infinity).filter((child) => child != null && child !== false);

/** Crea un elemento: h('button', { class: 'btn', onclick }, 'Texto', otroNodo) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...flatten(children));
  return el;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

export function setAppBar(title, ...actions) {
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-actions').replaceChildren(...flatten(actions));
  document.title = title === 'Orden' ? 'Orden' : `${title} · Orden`;
}

export function toast(message, { actionLabel, onAction, duration = 3000 } = {}) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, message));
  const close = () => el.remove();
  if (actionLabel) {
    el.append(h('button', { class: 'toast-action', type: 'button', onclick: () => { close(); onAction?.(); } }, actionLabel));
  }
  root.append(el);
  if (duration > 0) setTimeout(close, duration);
  return close;
}

/** Diálogo de confirmación modal. Resuelve true si se confirma. */
export function confirmDialog({ title, message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog' },
      h('form', { method: 'dialog', class: 'stack' },
        title && h('h2', { class: 'dialog-title' }, title),
        message && h('p', { class: 'muted' }, message),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => dialog.close('cancel') }, cancelLabel),
          h('button', { class: danger ? 'btn btn-danger-solid' : 'btn btn-primary', value: 'ok' }, confirmLabel)
        )
      )
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Diálogo con un campo de texto. Resuelve con el texto ingresado, o null si se cancela. */
export function promptDialog({ title, label, value = '', confirmLabel = 'Guardar', cancelLabel = 'Cancelar', maxLength }) {
  return new Promise((resolve) => {
    const input = h('input', {
      class: 'input',
      type: 'text',
      value,
      maxlength: maxLength ? String(maxLength) : null,
      required: true,
      autocomplete: 'off',
      enterkeyhint: 'done',
      'aria-label': label ?? title,
    });
    // El botón Cancelar es type="button" para que Enter confirme y no cancele.
    const dialog = h('dialog', { class: 'dialog' },
      h('form', { method: 'dialog', class: 'stack' },
        title && h('h2', { class: 'dialog-title' }, title),
        input,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => dialog.close('cancel') }, cancelLabel),
          h('button', { class: 'btn btn-primary', value: 'ok' }, confirmLabel)
        )
      )
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok' ? input.value : null);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    input.select();
  });
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}
