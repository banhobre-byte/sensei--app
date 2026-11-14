const CACHE_NAME = 'sensei-v52';
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './nutrition.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache:'reload' salta la caché HTTP del navegador: sin esto, una copia antigua de index.html
    // (GitHub Pages la mantiene unos minutos) podía quedar guardada dentro de la versión nueva.
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Peticiones a otros dominios (la API de GitHub para sensei-data): no se interceptan ni se guardan.
  if (url.origin !== self.location.origin) return;

  // week.json, nutrition.json y fases.json: NETWORK FIRST — siempre intenta traer la versión más reciente.
  // Si no hay internet, cae a la última copia cacheada.
  if (url.pathname.endsWith('week.json') || url.pathname.endsWith('nutrition.json') || url.pathname.endsWith('fases.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(event.request)))
    );
    return;
  }

  // La propia página (index.html): NETWORK FIRST. Con conexión se sirve siempre la última versión
  // publicada, así una actualización llega sola, sin borrar caché ni reinstalar. Sin conexión,
  // se usa la copia guardada.
  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (event.request.method === 'GET' && url.origin === self.location.origin && isPage) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match('./index.html')))
    );
    return;
  }

  // Resto de archivos (iconos, manifest): CACHE FIRST — para que funcione offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
