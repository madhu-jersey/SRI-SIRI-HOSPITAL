import { type AuthMode, staffApi } from './session';

// Notifications on this device, even when the dashboard app is closed.

export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'off' | 'blocked' | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

// Makes the dashboard installable as its own app ("Consultations").
export function setUpDashboardApp() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/dashboard.webmanifest';
    document.head.appendChild(link);
  }
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    for (const [name, content] of [['apple-mobile-web-app-capable', 'yes'], ['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-title', 'Consultations'], ['apple-mobile-web-app-status-bar-style', 'default']]) {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    }
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

function keyBytes(base64: string) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function deviceLabel() {
  const agent = navigator.userAgent;
  const device = /Android/.test(agent) ? 'Android' : isIos() ? 'iPhone/iPad' : /Windows/.test(agent) ? 'Windows' : /Mac/.test(agent) ? 'Mac' : 'Device';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  return `${device} · ${browser}${isStandalone() ? ' app' : ''}`;
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

// Re-sends this device's address to the server, in case it changed.
export async function syncPush(mode: AuthMode) {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  if (subscription) await staffApi(mode, 'push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), label: deviceLabel() } }).catch(() => {});
}

export async function enablePush(mode: AuthMode, publicKey: string) {
  if (!publicKey) throw new Error('Notifications are not set up on the server yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked for this site. Allow them in the browser’s site settings (the lock icon next to the address), then try again.'
      : 'Notifications were not allowed.');
  }
  const reg = await registration();
  let subscription: PushSubscription;
  try {
    subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  } catch {
    throw new Error('This browser could not sign up for notifications. Use Chrome, Edge or Safari (installed on the home screen on iPhone), and check notifications are allowed for this site.');
  }
  await staffApi(mode, 'push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), label: deviceLabel() } });
}

export async function disablePush(mode: AuthMode) {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  if (!subscription) return;
  await staffApi(mode, 'push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe();
}

export async function testPush(mode: AuthMode) {
  return staffApi<{ sent: number }>(mode, 'push/test', { method: 'POST' });
}
