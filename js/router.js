import { setAppBar } from './lib/ui.js';

// Rutas por hash: #/nombre/param1/param2. Cada vista exporta render(root, params)
// y puede devolver una función de limpieza.

const routes = new Map();
let defaultRoute = null;
let cleanup = null;
let navigationId = 0;

export function route(name, title, loader) {
  routes.set(name, { title, loader });
}

/** replace: true reemplaza la entrada actual del historial (por ejemplo, al salir de un formulario). */
export function navigate(path, { replace = false } = {}) {
  if (replace) location.replace(`#/${path}`);
  else location.hash = `#/${path}`;
}

export function start(fallback) {
  defaultRoute = fallback;
  window.addEventListener('hashchange', resolve);
  resolve();
}

async function resolve() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const current = routes.get(name);
  if (!current) {
    location.replace(`#/${defaultRoute}`);
    return;
  }

  const id = ++navigationId;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  document.querySelectorAll('.tabbar a').forEach((link) => {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  setAppBar(current.title);
  const root = document.getElementById('view');
  root.replaceChildren();
  window.scrollTo(0, 0);

  const module = await current.loader();
  if (id !== navigationId) return;
  const result = await module.render(root, params.map(decodeURIComponent));
  if (id !== navigationId) {
    if (typeof result === 'function') result();
    return;
  }
  cleanup = result;
}
