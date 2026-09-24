import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

// Hostnames (resolved, all addresses, cached) or literal IPs / CIDRs (v4 only for CIDR).
const RAW = (process.env.FLUX_TRUSTED_PROXY_HOSTS ?? 'caddy').split(',').map(s => s.trim()).filter(Boolean);
const TTL_MS = 60_000;
let cache: { at: number; ips: Set<string>; cidrs: Array<[number, number]> } | null = null;

export function normalizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const v = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return isIP(v) ? v : undefined;
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

function parseCidr(s: string): [number, number] | null {
  const [base, bits] = s.split('/');
  if (isIP(base) !== 4 || bits === undefined) return null;
  const n = Number(bits);
  if (!(n >= 0 && n <= 32)) return null;
  const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
  return [v4ToInt(base) & mask, mask];
}

export async function trustedSet(force = false): Promise<{ ips: Set<string>; cidrs: Array<[number, number]> }> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache;
  const ips = new Set<string>();
  const cidrs: Array<[number, number]> = [];
  for (const entry of RAW) {
    const cidr = entry.includes('/') ? parseCidr(entry) : null;
    if (cidr) {
      cidrs.push(cidr);
      continue;
    }
    if (isIP(entry)) {
      ips.add(entry);
      continue;
    }
    try {
      for (const a of await dns.lookup(entry, { all: true })) {
        const n = normalizeIp(a.address);
        if (n) ips.add(n);
      }
    } catch (err) {
      console.warn(`[trusted-proxy] lookup failed for ${entry}: ${(err as Error).message} — treating as untrusted`);
    }
  }
  const next = { at: Date.now(), ips, cidrs };
  const changed = !cache || [...ips].sort().join(',') !== [...cache.ips].sort().join(',');
  if (changed) console.log(`[trusted-proxy] trusted peers: ${[...ips].join(', ') || '(none)'}${cidrs.length ? ` + ${cidrs.length} CIDR(s)` : ''}`);
  cache = next;
  return next;
}

export function peerAddress(c: Context): string | undefined {
  try {
    return normalizeIp(getConnInfo(c).remote.address);
  } catch {
    return undefined;
  }
}

export async function isTrustedPeer(c: Context): Promise<boolean> {
  const ip = peerAddress(c);
  if (!ip) return false; // fail closed
  const { ips, cidrs } = await trustedSet();
  if (ips.has(ip)) return true;
  if (isIP(ip) === 4) {
    const n = v4ToInt(ip);
    return cidrs.some(([base, mask]) => (n & mask) === base);
  }
  return false;
}
