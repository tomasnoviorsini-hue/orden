// Subir VERSION en cada cambio de archivos para que el celular descargue la nueva versión.
const VERSION = 'v8';
const CACHE = `orden-${VERSION}`;
// Lector de capturas (vendor/, ≈ 6 MB): no se precarga; se guarda al primer uso y se conserva
// entre versiones. Cambiar el sufijo solo si cambian esos archivos.
const VENDOR_CACHE = 'orden-vendor-1';

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
  'js/lib/ocr.js',
  'js/lib/ui.js',
  'js/modules/settings/settings.repo.js',
  'js/modules/settings/settings.view.js',
  'js/modules/tasks/tasks.repo.js',
  'js/modules/tasks/tasks.view.js',
  'js/modules/finance/categories.repo.js',
  'js/modules/finance/categories.view.js',
  'js/modules/finance/classifier.js',
  'js/modules/finance/finance.view.js',
  'js/modules/finance/metrics.js',
  'js/modules/finance/period-income.repo.js',
  'js/modules/finance/period-nav.js',
  'js/modules/finance/screenshot.view.js',
  'js/modules/finance/summary.view.js',
  'js/modules/finance/transaction-form.view.js',
  'js/modules/finance/transactions.repo.js',
  'js/modules/finance/ingest/ingest.js',
  'js/modules/finance/ingest/sources/manual.js',
  'js/modules/finance/ingest/sources/screenshot.js',
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
      keys.filter((key) => key.startsWith('orden-') && key !== CACHE && key !== VENDOR_CACHE).map((key) => caches.delete(key))
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
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/vendor/')) {
    event.respondWith(caches.open(VENDOR_CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
