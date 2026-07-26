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

// Instalação - guarda os arquivos em cache
self.addEventListener('install', event => {
  console.log('📦 Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache aberto com sucesso!');
        return cache.addAll(urlsToCache).catch(err => {
          console.log('❌ Erro ao adicionar ao cache:', err);
        });
      })
  );
});

// Busca - serve os arquivos do cache ou da internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se achou no cache, retorna do cache
        if (response) {
          return response;
        }
        // Se não, busca na internet
        return fetch(event.request);
      })
  );
});

// Atualização - limpa caches antigos
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker ativado!');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});