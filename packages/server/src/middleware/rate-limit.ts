import { createMiddleware } from 'hono/factory';
import { isTrustedPeer, peerAddress } from './trusted-proxy.js';

type RateLimitConfig = {
  windowMs: number;  // Time window in ms
  maxRequests: number;  // Max requests per window
};

// In-memory store for rate limiting
const requestCounts = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts) {
    if (value.resetAt < now) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Cleanup every minute

/**
 * Simple in-memory rate limiter middleware
 */
export function rateLimit(config: RateLimitConfig) {
  return createMiddleware(async (c, next) => {
    // Only honour X-Forwarded-For / X-Real-IP from a trusted proxy peer —
    // otherwise any client could spoof these headers to evade rate limiting.
    const trusted = await isTrustedPeer(c);
    const ip = (trusted && (c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
               c.req.header('X-Real-IP'))) ||
               peerAddress(c) ||
               'unknown';
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    let entry = requestCounts.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + config.windowMs };
      requestCounts.set(key, entry);
    }

    entry.count++;

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests' }, 429);
    }

    return next();
  });
}
