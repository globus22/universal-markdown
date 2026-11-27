/* Universal Tools — service worker.
   Ядро сайта кэшируется при установке. Всё остальное с этого же сайта (библиотеки, OCR-модели,
   HEIC-декодер) — при первом использовании, после чего работает офлайн.
   При изменении файлов увеличьте версию CACHE. */
const CACHE = 'universal-tools-v3.0.0';
const CORE = [
  './', './index.html', './markdown.html', './photo.html',
  './css/common.css', './css/hub.css', './css/markdown.css', './css/photo.css',
  './js/common.js',
  './js/markdown/utils.js', './js/markdown/ocr.js', './js/markdown/transform.js',
  './js/markdown/formats-office.js', './js/markdown/formats-sheets.js', './js/markdown/formats-pdf.js', './js/markdown/app.js',
  './js/photo/metadata.js', './js/photo/app.js',
  './vendor/jszip.min.js', './vendor/exifr.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Отдаём из кэша сразу и обновляем кэш в фоне (stale-while-revalidate).
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request).then(response => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
