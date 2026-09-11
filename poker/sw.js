const CACHE_NAME = 'felt-poker-v17';
const APP_FILES = ['./?v=17', './index.html?v=17', './style.css?v=17', './game.js?v=17', './sw.js?v=17'];
const CARD_FILES = ['back@2x.png', 'j01@2x.png', 'j02@2x.png'];
for (const suit of ['s', 'h', 'd', 'c']) for (let rank = 1; rank <= 13; rank++) CARD_FILES.push(`${suit}${String(rank).padStart(2, '0')}@2x.png`);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...APP_FILES, ...CARD_FILES.map(file => `../cards/${file}`)])));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}));
    return;
  }
  const requestUrl = new URL(event.request.url);
  const appNames = new Set(['/poker/', '/poker/index.html', '/poker/style.css', '/poker/game.js']);
  if (appNames.has(requestUrl.pathname)) {
    const cacheUrl = `${requestUrl.pathname.endsWith('/') ? './' : `./${requestUrl.pathname.split('/').pop()}`}?v=17`;
    event.respondWith(caches.match(new URL(cacheUrl, requestUrl.origin)).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
