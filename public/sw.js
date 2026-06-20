const CACHE_NAME = 'pet-erp-v1';
const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // 僅快取同源的 GET 請求靜態資源，完全排除 Supabase API 與任何跨域請求，避免網路卡死或緩存過期資料
  if (
    e.request.method !== 'GET' || 
    !e.request.url.startsWith(self.location.origin) ||
    url.pathname.includes('/rest/v1/')
  ) {
    return; // 不進行響應攔截，交由瀏覽器原生網路處理
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // 背景嘗試更新快取
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
