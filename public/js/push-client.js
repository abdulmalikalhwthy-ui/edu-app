/* ============================================================
   push-client.js — إدارة الاشتراك في إشعارات Push
   ============================================================ */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker غير مدعوم');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('✅ SW مسجل:', reg.scope);
    return reg;
  } catch (err) {
    console.error('❌ فشل تسجيل SW:', err);
    return null;
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

async function subscribeToPush(userId) {
  if (!userId) return false;

  const reg = await navigator.serviceWorker.ready;
  if (!reg || !reg.pushManager) {
    console.warn('Push غير مدعوم');
    return false;
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.warn('الإذن مرفوض');
    return false;
  }

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try { await existing.unsubscribe(); } catch (e) {}
    }

    const keyResp = await fetch('/api/push/vapid-public-key');
    const { publicKey } = await keyResp.json();
    if (!publicKey) {
      console.error('VAPID public key غير متاح');
      return false;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    const resp = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, subscription })
    });

    if (!resp.ok) throw new Error('فشل حفظ الاشتراك');
    console.log('✅ تم الاشتراك في Push');
    return true;
  } catch (err) {
    console.error('❌ فشل الاشتراك:', err);
    return false;
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint })
    });
    await sub.unsubscribe();
  }
}

async function sendTestNotification() {
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') return;
  }
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('🔔 اختبار الإشعارات', {
    body: 'إذا رأيت هذا الإشعار، فالنظام يعمل بنجاح!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    dir: 'rtl',
    lang: 'ar'
  });
}

(async function init() {
  await registerServiceWorker();
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user && user.id) {
      setTimeout(() => subscribeToPush(user.id), 1500);
    }
  } catch (e) {}
})();

window.PushClient = {
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestNotification
};