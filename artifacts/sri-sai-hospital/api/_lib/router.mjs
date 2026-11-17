import { timingSafeEqual } from 'node:crypto';
import { HttpError, clientIp, readJson, resolveRoute, sendJson, siteUrlFor } from './http.mjs';

// One Vercel function serves every route (the Hobby plan allows 12 functions).

export function createRouter({ config, store, service }) {
  async function requireStaff(request) {
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Please sign in.');
    const user = await store.getUserFromToken(token);
    if (!user) throw new HttpError(401, 'Your session has ended. Please sign in again.');
    const staff = await store.getStaff(user.id);
    if (!staff) throw new HttpError(403, 'This account does not have dashboard access.');
    return { ...staff, email: user.email };
  }

  function requireCron(request, secret = config.cronSecret) {
    const header = String(request.headers?.authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(header);
    if (!secret || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new HttpError(401, 'Not allowed.');
    }
  }

  const routes = {
    'GET config': () => service.publicConfig(),
    'GET slots': ({ query }) => service.slots(query.get('hold') ?? undefined),
    'POST holds': async ({ request }) => service.hold(await readJson(request), clientIp(request)),
    'POST holds/release': async ({ request }) => service.release(await readJson(request)),
    'POST requests': async ({ request, site }) => service.request(await readJson(request), clientIp(request), site),
    'GET track': ({ query, site }) => service.track(query.get('t'), site),
    'GET feedback': ({ query }) => service.feedbackInfo(query.get('t')),
    'POST feedback': async ({ request }) => service.submitFeedback(await readJson(request), clientIp(request)),
    'GET cron/cleanup': ({ request }) => { requireCron(request); return service.cleanup(); },
    'GET cron/reminders': ({ request }) => { requireCron(request, config.remindersSecret); return service.cronReminders(); },
    'POST cron/reminders': ({ request }) => { requireCron(request, config.remindersSecret); return service.cronReminders(); },

    'POST auth/demo': async ({ request }) => {
      if (store.kind !== 'memory' || !store.demoSignIn) throw new HttpError(404, 'Not found.');
      const body = await readJson(request);
      const token = await store.demoSignIn(body.email, body.password);
      if (!token) throw new HttpError(401, 'Email or password is wrong.');
      return { accessToken: token };
    },
    'POST push/subscribe': async ({ request }) => { const staff = await requireStaff(request); return service.subscribePush(await readJson(request), staff); },
    'POST push/unsubscribe': async ({ request }) => { await requireStaff(request); return service.unsubscribePush(await readJson(request)); },
    'POST push/test': async ({ request }) => { const staff = await requireStaff(request); return service.testPush(staff); },
    'GET me': async ({ request }) => {
      const staff = await requireStaff(request);
      return { name: staff.display_name, role: staff.role, email: staff.email };
    },
    'GET dashboard': async ({ request, site }) => { await requireStaff(request); return service.dashboard(site); },
    'POST consultations/accept': async ({ request, site }) => { const staff = await requireStaff(request); return service.accept(await readJson(request), staff, site); },
    'POST consultations/reject': async ({ request, site }) => { const staff = await requireStaff(request); return service.reject(await readJson(request), staff, site); },
    'POST consultations/mark-sent': async ({ request }) => { const staff = await requireStaff(request); return service.markSent(await readJson(request), staff); },
    'POST consultations/start-link': async ({ request }) => { await requireStaff(request); return service.startLink(await readJson(request)); },
    'GET consultations/events': async ({ request, query }) => { await requireStaff(request); return service.events(query.get('id')); },
    'PUT settings': async ({ request }) => { const staff = await requireStaff(request); return service.saveSettings(await readJson(request), staff); },
    'GET calendar': async ({ request, query, site }) => { await requireStaff(request); return service.calendar(query.get('from'), query.get('days'), site); },
    'PUT hours': async ({ request }) => { const staff = await requireStaff(request); return service.saveHours(await readJson(request), staff); },
    'POST time-off': async ({ request, site }) => { const staff = await requireStaff(request); return service.addTimeOff(await readJson(request), staff, site); },
    'POST days/set': async ({ request, site }) => { const staff = await requireStaff(request); return service.setDayOpen(await readJson(request), staff, site); },
    'POST time-off/remove': async ({ request }) => { await requireStaff(request); return service.removeTimeOff(await readJson(request)); },
    'POST consultations/reschedule': async ({ request, site }) => { const staff = await requireStaff(request); return service.reschedule(await readJson(request), staff, site); },
    'POST consultations/cancel': async ({ request, site }) => { const staff = await requireStaff(request); return service.cancel(await readJson(request), staff, site); },
    'POST consultations/book': async ({ request, site }) => { const staff = await requireStaff(request); return service.staffBook(await readJson(request), staff, site); },
    'GET consultations/search': async ({ request, query, site }) => { await requireStaff(request); return service.search(query.get('q'), site); },
  };

  return async function handle(request, response) {
    const { route, query } = resolveRoute(request);
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    const handler = routes[`${method} ${route}`];
    try {
      if (!handler) {
        const known = Object.keys(routes).some((key) => key.endsWith(` ${route}`));
        throw new HttpError(known ? 405 : 404, known ? 'Method not allowed.' : 'Not found.');
      }
      const body = await handler({ request, query, site: siteUrlFor(request, config.siteUrl) });
      sendJson(response, 200, body);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message, ...(error.fields ? { fields: error.fields } : {}) });
        return;
      }
      console.error(`API error on ${method} ${route}:`, error);
      sendJson(response, 500, { error: 'Something went wrong on our side. Please try again, or call the hospital.' });
    }
  };
}
