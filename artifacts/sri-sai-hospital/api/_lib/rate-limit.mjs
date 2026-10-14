const HOUR_MS = 60 * 60 * 1000;

export class InMemoryRateLimiter {
  constructor(limit = 3, windowMs = HOUR_MS) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  consume(key, now = Date.now()) {
    const activeRequests = (this.requests.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs);
    if (activeRequests.length >= this.limit) {
      this.requests.set(key, activeRequests);
      return false;
    }
    activeRequests.push(now);
    this.requests.set(key, activeRequests);
    return true;
  }
}

export function clientIp(request) {
  const forwarded = request.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return request.socket?.remoteAddress ?? 'unknown';
}
