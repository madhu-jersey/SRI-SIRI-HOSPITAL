import { randomInt } from 'node:crypto';

// Video meeting providers. Both return the same shape so the rest of the app
// does not care which one is in use.
//   createMeeting({ topic, startsAt, minutes }) -> { provider, meetingId, joinUrl, passcode }
//   startUrl(meetingId) -> fresh host link (Zoom host links expire after ~2 hours)
//   deleteMeeting(meetingId)

export function createZoomProvider(config, fetchImpl = globalThis.fetch) {
  return config.zoomMode === 'live' ? liveZoom(config.zoom, fetchImpl) : mockZoom();
}

// Used until Zoom keys are added. The links look real but lead nowhere.
function mockZoom() {
  return {
    mode: 'mock',
    async createMeeting() {
      const meetingId = String(randomInt(1e9, 1e10));
      return { provider: 'zoom-mock', meetingId, joinUrl: `https://zoom.us/j/${meetingId}?pwd=test-meeting`, passcode: 'test' };
    },
    async startUrl(meetingId) {
      return `https://zoom.us/s/${meetingId}?test-meeting`;
    },
    async deleteMeeting() {},
  };
}

// Zoom Server-to-Server OAuth app (account credentials grant).
function liveZoom({ accountId, clientId, clientSecret }, fetchImpl) {
  let cached = null;

  async function token() {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const response = await fetchImpl(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
    });
    if (!response.ok) throw new Error(`Zoom sign-in failed (${response.status})`);
    const body = await response.json();
    cached = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cached.value;
  }

  async function call(path, init = {}) {
    const response = await fetchImpl(`https://api.zoom.us/v2${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Zoom request failed (${response.status})`);
    return response.json();
  }

  return {
    mode: 'live',
    async createMeeting({ topic, startsAt, minutes, zoomUser }) {
      const meeting = await call(`/users/${encodeURIComponent(zoomUser || 'me')}/meetings`, {
        method: 'POST',
        body: JSON.stringify({
          topic,
          type: 2,
          start_time: new Date(startsAt).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          duration: minutes,
          timezone: 'Asia/Kolkata',
          settings: { waiting_room: true, join_before_host: false, host_video: true, participant_video: true, mute_upon_entry: false, auto_recording: 'none' },
        }),
      });
      return { provider: 'zoom', meetingId: String(meeting.id), joinUrl: meeting.join_url, passcode: meeting.password ?? null };
    },
    async startUrl(meetingId) {
      const meeting = await call(`/meetings/${encodeURIComponent(meetingId)}`);
      return meeting.start_url;
    },
    async deleteMeeting(meetingId) {
      await call(`/meetings/${encodeURIComponent(meetingId)}`, { method: 'DELETE' });
    },
  };
}
