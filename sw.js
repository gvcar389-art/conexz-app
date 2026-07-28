// ==========================================
// CONEXZ - SERVICE WORKER
// ==========================================

const CACHE_NAME = 'conexz-v2'; // Mude a versão
const urlsToCache = [
  '/',
  '/static/css/style.css',
  '/static/js/script.js',
  '/static/manifest.json',
  '/static/icons/icon_192.png',
  '/static/icons/icon_512.png'
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
  // Força ativação imediata
  self.skipWaiting();
});

// Busca - ESTRATÉGIA CACHE FIRST
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // Fallback para offline
          return new Response('Offline - Conteúdo não disponível', {
            status: 503,
            statusText: 'Offline'
          });
        });
      })
  );
});

// Ativação
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
  // Toma controle das páginas imediatamente
  return self.clients.claim();
});