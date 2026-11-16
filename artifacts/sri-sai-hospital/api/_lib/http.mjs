// Plain Node request/response helpers, so the same router runs on Vercel and
// inside the Vite dev server.

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 32 * 1024;

export async function readJson(request) {
  // Vercel parses JSON bodies before the handler runs.
  if (request.body !== undefined) {
    if (typeof request.body === 'string') return parse(request.body);
    if (Buffer.isBuffer(request.body)) return parse(request.body.toString('utf8'));
    return request.body ?? {};
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString('utf8'));
}

function parse(text) {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

// Vercel's rewrite passes the path as ?route=...; the Vite middleware strips
// the /api/app prefix and leaves it in the path.
export function resolveRoute(request) {
  const url = new URL(request.url || '/', 'http://local');
  const raw = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/app/, '');
  url.searchParams.delete('route');
  return { route: raw.replace(/^\/+|\/+$/g, ''), query: url.searchParams };
}

export function clientIp(request) {
  const forwarded = request.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return request.socket?.remoteAddress ?? 'unknown';
}

// Public address of the site for links in messages.
export function siteUrlFor(request, configured) {
  if (configured) return configured;
  const host = request.headers?.['x-forwarded-host'] || request.headers?.host || 'localhost:5173';
  const proto = request.headers?.['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
