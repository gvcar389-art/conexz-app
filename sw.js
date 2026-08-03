// ==========================================
// CONEXZ - SERVICE WORKER
// ==========================================

const CACHE_NAME = 'conexz-v1';
const urlsToCache = [
  '/',
  '/static/css/style.css',
  '/static/js/script.js',
  '/static/manifest.json'
];

// Instalação
self.addEventListener('install', event => {
  console.log('📦 Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache aberto!');
        return cache.addAll(urlsToCache).catch(err => {
          console.log('❌ Erro ao adicionar ao cache:', err);
        });
      })
  );
  self.skipWaiting();
});

// Ativação
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker ativado!');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Busca
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});