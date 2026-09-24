import { describe, expect, it, beforeAll } from 'bun:test';
import type { Context } from 'hono';

// FLUX_TRUSTED_PROXY_HOSTS must be set before the module is first imported,
// since the trusted hostname/IP/CIDR list is parsed at module load time.
process.env.FLUX_TRUSTED_PROXY_HOSTS = '172.18.0.9,10.0.0.0/8,192.168.0.0/16';

let normalizeIp: typeof import('./trusted-proxy').normalizeIp;
let trustedSet: typeof import('./trusted-proxy').trustedSet;
let isTrustedPeer: typeof import('./trusted-proxy').isTrustedPeer;

beforeAll(async () => {
  const mod = await import('./trusted-proxy');
  normalizeIp = mod.normalizeIp;
  trustedSet = mod.trustedSet;
  isTrustedPeer = mod.isTrustedPeer;
});

describe('normalizeIp', () => {
  it('strips the ::ffff: IPv4-mapped prefix', () => {
    expect(normalizeIp('::ffff:172.18.0.5')).toBe('172.18.0.5');
  });

  it('returns undefined for a non-IP string', () => {
    expect(normalizeIp('garbage')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeIp(undefined)).toBeUndefined();
  });
});

describe('trustedSet', () => {
  it('parses literal IPs and CIDR ranges from FLUX_TRUSTED_PROXY_HOSTS', async () => {
    const { ips, cidrs } = await trustedSet(true);
    expect(ips.has('172.18.0.9')).toBe(true);
    expect(cidrs.length).toBeGreaterThan(0);
  });
});

describe('isTrustedPeer', () => {
  it('fails closed when the peer address cannot be determined', async () => {
    // A context that doesn't look like a real Hono request context will
    // cause getConnInfo() to throw internally; peerAddress() catches that
    // and returns undefined, which must fail closed (untrusted).
    const fakeContext = {} as unknown as Context;
    await expect(isTrustedPeer(fakeContext)).resolves.toBe(false);
  });

  // @hono/node-server's getConnInfo() reads the peer address from
  // c.env.incoming.socket.remoteAddress (or c.env.server.incoming... when
  // running under Bun's server binding, which we don't use here).
  function fakeContext(remoteAddress: string | undefined): Context {
    return {
      env: { incoming: { socket: { remoteAddress } } },
    } as unknown as Context;
  }

  it('trusts an IPv4-mapped literal IP match', async () => {
    await expect(isTrustedPeer(fakeContext('::ffff:172.18.0.9'))).resolves.toBe(true);
  });

  it('rejects a literal IP that is not in the trusted set', async () => {
    await expect(isTrustedPeer(fakeContext('172.18.0.10'))).resolves.toBe(false);
  });

  it('trusts an address inside a configured CIDR range', async () => {
    await expect(isTrustedPeer(fakeContext('10.1.2.3'))).resolves.toBe(true);
  });

  it('trusts an address inside the 192.168.0.0/16 CIDR range', async () => {
    await expect(isTrustedPeer(fakeContext('192.168.1.12'))).resolves.toBe(true);
  });

  it('rejects an address just outside the 192.168.0.0/16 CIDR range', async () => {
    await expect(isTrustedPeer(fakeContext('192.169.0.1'))).resolves.toBe(false);
  });

  it('fails closed when remoteAddress is undefined', async () => {
    await expect(isTrustedPeer(fakeContext(undefined))).resolves.toBe(false);
  });
});
