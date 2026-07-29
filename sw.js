// ==========================================
// CONEXZ - SERVICE WORKER OTIMIZADO
// ==========================================

const CACHE_NAME = 'conexz-v3';
const urlsToCache = [
  '/',
  '/static/css/style.css',
  '/static/js/script.js',
  '/manifest.json',
  '/static/icons/launchericon-192x192.png',
  '/static/icons/launchericon-512x512.png'
];

// Instalação
self.addEventListener('install', event => {
  console.log('📦 Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache aberto!');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('❌ Erro ao adicionar ao cache:', err);
      })
  );
  self.skipWaiting();
});

// Busca - Estratégia Cache First
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          return new Response('Offline - Conteúdo não disponível', {
            status: 503,
            statusText: 'Offline'
          });
        });
      })
  );
});

// Ativação - Limpa caches antigos
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker ativado!');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});
