import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.mjs';
import { createMemoryStore } from './store/memory.mjs';

const ENV = { CONSULT_STORE: 'memory', APP_SECRET: 'test-secret-value', HOSPITAL_WHATSAPP: '917075009876', CRON_SECRET: 'cron', SITE_URL: 'https://example.test' };
const START = Date.parse('2026-11-16T04:30:00Z');
const device = (n) => ({ endpoint: `https://push.example.test/send/${n}`, keys: { p256dh: `key-${n}`, auth: `auth-${n}` } });

async function setup() {
  const now = () => START;
  const store = createMemoryStore({ now, demoPassword: 'pw' });
  const sent = [];
  const gone = new Set();
  const push = {
    enabled: true,
    publicKey: 'public-key',
    async send(subscription, payload) {
      if (gone.has(subscription.endpoint)) return { ok: false, gone: true };
      sent.push({ to: subscription.endpoint, ...payload });
      return { ok: true };
    },
  };
  const app = await buildApp({ env: ENV, store, now, push });
  let ip = 0;
  async function call(method, route, { body, token } = {}) {
    const request = { method, url: `/api/app?route=${route}`, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': `198.51.100.${(ip += 1)}` }, body, socket: {} };
    if (body === undefined) request[Symbol.asyncIterator] = async function* () {};
    const response = { statusCode: 0, setHeader() {}, end(text) { this.text = text; } };
    await app.handle(request, response);
    return { status: response.statusCode, body: JSON.parse(response.text) };
  }
  const { body: { accessToken: token } } = await call('POST', 'auth/demo', { body: { email: 'doctor@demo.local', password: 'pw' } });
  return { call, token, sent, gone, store };
}

test('the public key is in the config for the dashboard', async () => {
  const { call } = await setup();
  assert.equal((await call('GET', 'config')).body.pushPublicKey, 'public-key');
});

test('signing up a device needs sign-in and a valid address', async () => {
  const { call, token } = await setup();
  assert.equal((await call('POST', 'push/subscribe', { body: { subscription: device(1) } })).status, 401);
  assert.equal((await call('POST', 'push/subscribe', { token, body: { subscription: { endpoint: 'http://insecure', keys: {} } } })).status, 400);
  assert.equal((await call('POST', 'push/subscribe', { token, body: { subscription: device(1), label: 'Android · Chrome app' } })).status, 200);
});

test('a new booking notifies every signed-up device', async () => {
  const { call, token, sent } = await setup();
  await call('POST', 'push/subscribe', { token, body: { subscription: device(1) } });
  await call('POST', 'push/subscribe', { token, body: { subscription: device(2) } });
  // Signing up the same device twice does not double its notifications.
  await call('POST', 'push/subscribe', { token, body: { subscription: device(2) } });
  const hold = await call('POST', 'holds', { body: { start: '2026-11-16T12:00:00.000Z' } });
  const request = await call('POST', 'requests', { body: { holdToken: hold.body.holdToken, name: 'Ravi Kumar', phone: '9876543210', confirmPhone: '9876543210', consent: true } });
  assert.equal(request.status, 200);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].title, 'New consultation request');
  assert.equal(sent[0].body, `Ravi Kumar · Mon, 16 Nov 2026, 5:30 PM · ${request.body.ref}`);
  assert.equal(sent[0].url, '/dashboard');
});

test('devices the browser has dropped are removed', async () => {
  const { call, token, sent, gone, store } = await setup();
  await call('POST', 'push/subscribe', { token, body: { subscription: device(1) } });
  await call('POST', 'push/subscribe', { token, body: { subscription: device(2) } });
  gone.add(device(1).endpoint);
  const result = await call('POST', 'push/test', { token });
  assert.equal(result.body.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal((await store.listPushDevices()).length, 1);
});

test('turning notifications off stops them', async () => {
  const { call, token } = await setup();
  await call('POST', 'push/subscribe', { token, body: { subscription: device(1) } });
  await call('POST', 'push/unsubscribe', { token, body: { endpoint: device(1).endpoint } });
  assert.equal((await call('POST', 'push/test', { token })).status, 409);
});

test('a notification failure never blocks a booking', async () => {
  const now = () => START;
  const store = createMemoryStore({ now });
  const app = await buildApp({ env: ENV, store, now, push: { enabled: true, publicKey: 'k', async send() { throw new Error('push service down'); } } });
  await store.savePushDevice('push:x', { subscription: device(9), user_id: 'u' });
  const call = async (method, route, body) => {
    const request = { method, url: `/api/app?route=${route}`, headers: { 'x-forwarded-for': '203.0.113.5' }, body, socket: {} };
    const response = { statusCode: 0, setHeader() {}, end(text) { this.text = text; } };
    await app.handle(request, response);
    return { status: response.statusCode, body: JSON.parse(response.text) };
  };
  const hold = await call('POST', 'holds', { start: '2026-11-16T12:00:00.000Z' });
  const request = await call('POST', 'requests', { holdToken: hold.body.holdToken, name: 'Ravi Kumar', phone: '9876543210', confirmPhone: '9876543210', consent: true });
  assert.equal(request.status, 200);
});
