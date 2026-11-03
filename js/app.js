import { openDB } from './db/idb.js';
import { route, start } from './router.js';
import { h, toast } from './lib/ui.js';

route('tareas', 'Tareas', () => import('./modules/tasks/tasks.view.js'));
route('finanzas', 'Finanzas', () => import('./modules/finance/finance.view.js'));
route('ajustes', 'Ajustes', () => import('./modules/settings/settings.view.js'));

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  const registration = await navigator.serviceWorker.register('sw.js');

  const offerUpdate = (worker) => toast('Hay una nueva versión disponible.', {
    actionLabel: 'Actualizar',
    onAction: () => worker.postMessage('SKIP_WAITING'),
    duration: 0,
  });

  if (registration.waiting && hadController) offerUpdate(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  });

  // Recargar solo cuando una versión nueva reemplaza a otra, no en la primera instalación.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

async function main() {
  try {
    await openDB();
  } catch (error) {
    document.getElementById('view').replaceChildren(
      h('div', { class: 'empty' }, `No se pudo abrir la base de datos. ${error.message ?? ''}`)
    );
    return;
  }

  // Pide al navegador que no borre los datos ante falta de espacio.
  navigator.storage?.persist?.().catch(() => {});

  start('tareas');
  registerServiceWorker().catch((error) => console.error('Service worker:', error));
}

main();
