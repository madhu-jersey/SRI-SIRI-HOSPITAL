// Web push: notifications on the doctor's phone or computer, even when the
// dashboard app is closed. Uses VAPID keys; the private key never leaves the server.
//   send(subscription, { title, body, url, tag }) -> { ok } | { ok: false, gone }
// "gone" means the browser has dropped that subscription, so it can be deleted.

export function createPushProvider(config) {
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey) {
    return { enabled: false, publicKey: '', async send() { return { ok: false, gone: false }; } };
  }
  let library;
  return {
    enabled: true,
    publicKey,
    async send(subscription, payload) {
      library ??= (await import('web-push')).default;
      try {
        await library.sendNotification(subscription, JSON.stringify(payload), {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 6 * 60 * 60,
          urgency: 'high',
          timeout: 6000,
        });
        return { ok: true };
      } catch (error) {
        const gone = error?.statusCode === 404 || error?.statusCode === 410;
        if (!gone) console.error('Push failed', error?.statusCode ?? '', error?.message ?? error);
        return { ok: false, gone };
      }
    },
  };
}
