/* ============================================================
   sw.js — Service Worker لتلقي إشعارات Push
   ============================================================ */

const CACHE_NAME = 'edu-app-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/student.html',
  '/teacher.html',
  '/css/style.css',
  '/js/recorder.js',
  '/js/student.js',
  '/js/teacher.js',
  '/js/push-client.js',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'تنبيه', body: event.data ? event.data.text() : '' }; }

  const title = data.title || '🔴 تنبيه جديد';
  const isLive = data.type === 'live_session';

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: isLive ? [800, 200, 800, 200, 800, 200, 800] : [200, 100, 200],
    requireInteraction: true,
    tag: isLive ? 'live-session-' + Date.now() : 'notification-' + Date.now(),
    renotify: true,
    silent: false,
    dir: 'rtl',
    lang: 'ar',
    data: {
      url: data.url || '/student.html',
      type: data.type || 'general',
      room_link: data.room_link || null,
      password: data.password || null
    },
    actions: isLive ? [
      { action: 'join', title: '🚪 دخول القاعة' },
      { action: 'close', title: 'لاحقاً' }
    ] : [
      { action: 'open', title: 'فتح التطبيق' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const data = event.notification.data || {};
  let targetUrl = data.url || '/';

  if (data.type === 'live_session' && data.room_link) {
    targetUrl = data.room_link;
    if (data.password) targetUrl += '#config.callPassword=' + encodeURIComponent(data.password);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});