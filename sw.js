// Subir VERSION en cada cambio de archivos para que el celular descargue la nueva versión.
const VERSION = 'v7';
const CACHE = `orden-${VERSION}`;

// Todo archivo nuevo de la app debe agregarse acá para funcionar offline.
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/router.js',
  'js/backup/backup.js',
  'js/db/idb.js',
  'js/db/schema.js',
  'js/lib/charts.js',
  'js/lib/date.js',
  'js/lib/id.js',
  'js/lib/money.js',
  'js/lib/ui.js',
  'js/modules/settings/settings.repo.js',
  'js/modules/settings/settings.view.js',
  'js/modules/tasks/tasks.repo.js',
  'js/modules/tasks/tasks.view.js',
  'js/modules/finance/categories.repo.js',
  'js/modules/finance/categories.view.js',
  'js/modules/finance/finance.view.js',
  'js/modules/finance/metrics.js',
  'js/modules/finance/period-income.repo.js',
  'js/modules/finance/period-nav.js',
  'js/modules/finance/summary.view.js',
  'js/modules/finance/transaction-form.view.js',
  'js/modules/finance/transactions.repo.js',
  'js/modules/finance/ingest/ingest.js',
  'js/modules/finance/ingest/sources/manual.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('orden-') && key !== CACHE).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
