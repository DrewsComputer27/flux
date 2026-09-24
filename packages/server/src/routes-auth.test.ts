import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

// Env must be set before ./index.js is imported: FLUX_DATA is read at module
// load time to pick the storage adapter/path, FLUX_API_KEY/FLUX_ADMIN_USERS/
// FLUX_TRUSTED_PROXY_HOSTS are read lazily but we set them up front too so
// every request in this file sees a consistent configuration.
process.env.FLUX_NO_LISTEN = '1';
const DATA_FILE = join(tmpdir(), `flux-routes-auth-test-${Date.now()}-${process.pid}.sqlite`);
process.env.FLUX_DATA = DATA_FILE;
process.env.FLUX_API_KEY = 'test-env-key-0123456789';
process.env.FLUX_ADMIN_USERS = 'drew';
// NOTE: trusted-proxy.ts reads FLUX_TRUSTED_PROXY_HOSTS once at module load
// time, and the module is a process-wide singleton shared with
// middleware/trusted-proxy.test.ts. Bun evaluates every test file's
// top-level (synchronous) code before running any file's beforeAll, so
// whichever file's top-level assignment runs last "wins" by the time either
// file's dynamic import resolves. Use the exact same value as
// trusted-proxy.test.ts so the outcome doesn't depend on file run order.
process.env.FLUX_TRUSTED_PROXY_HOSTS = '172.18.0.9,10.0.0.0/8,192.168.0.0/16';

let app: typeof import('./index.js').app;

beforeAll(async () => {
  ({ app } = await import('./index.js'));
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    const path = DATA_FILE + suffix;
    if (existsSync(path)) unlinkSync(path);
  }
});

// Fake peer environments — see trusted-proxy.test.ts for why this shape
// matches what @hono/node-server's getConnInfo() reads.
const trusted = { incoming: { socket: { remoteAddress: '::ffff:172.18.0.9' } } };
const untrusted = { incoming: { socket: { remoteAddress: '172.18.0.1' } } };

const ENV_KEY = 'test-env-key-0123456789';

function json(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

describe('admin-gated key management (/api/auth/keys, /api/auth/cli-complete)', () => {
  let createdKeyId: string;

  it('a. rejects key creation from an untrusted peer using the env Bearer key (403 — not an Authentik admin)', async () => {
    const res = await app.request(
      '/api/auth/keys',
      json('POST', { name: 'x' }, { Authorization: `Bearer ${ENV_KEY}` }),
      untrusted
    );
    expect(res.status).toBe(403);
  });

  it('b. allows key creation from a trusted peer authenticated as an admin Authentik user', async () => {
    const res = await app.request(
      '/api/auth/keys',
      json('POST', { name: 'y' }, { 'X-Authentik-Username': 'drew' }),
      trusted
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    createdKeyId = body.id;
  });

  it('c. rejects key creation from a trusted peer for a non-admin Authentik user', async () => {
    const res = await app.request(
      '/api/auth/keys',
      json('POST', { name: 'z' }, { 'X-Authentik-Username': 'someoneelse' }),
      trusted
    );
    expect(res.status).toBe(401);
  });

  it('d. ignores the Authentik header entirely when the peer is untrusted', async () => {
    const res = await app.request(
      '/api/auth/keys',
      json('POST', { name: 'w' }, { 'X-Authentik-Username': 'drew' }),
      untrusted
    );
    expect(res.status).toBe(401);
  });

  it('e. deletes the key as a trusted admin, then blocks the same delete from an untrusted env-key caller', async () => {
    const okRes = await app.request(
      `/api/auth/keys/${createdKeyId}`,
      json('DELETE', undefined, { 'X-Authentik-Username': 'drew' }),
      trusted
    );
    expect(okRes.status).toBeGreaterThanOrEqual(200);
    expect(okRes.status).toBeLessThan(300);

    const blockedRes = await app.request(
      `/api/auth/keys/${createdKeyId}`,
      json('DELETE', undefined, { Authorization: `Bearer ${ENV_KEY}` }),
      untrusted
    );
    expect(blockedRes.status).toBe(403);
  });

  it('h. rejects /api/auth/cli-complete from an untrusted peer using the env Bearer key (403)', async () => {
    const res = await app.request(
      '/api/auth/cli-complete',
      json('POST', {}, { Authorization: `Bearer ${ENV_KEY}` }),
      untrusted
    );
    expect(res.status).toBe(403);
  });
});

describe('comment identity + PATCH allow-list', () => {
  let projectId: string;
  let taskId: string;
  let originalCreatedAt: string;

  it('f. records server-set identity for a trusted Authentik comment, and omits it for an env-key comment', async () => {
    const projectRes = await app.request(
      '/api/projects',
      json('POST', { name: 'Identity Test Project' }, { 'X-Authentik-Username': 'drew' }),
      trusted
    );
    expect(projectRes.status).toBe(201);
    const project = await projectRes.json();
    projectId = project.id;

    const taskRes = await app.request(
      `/api/projects/${projectId}/tasks`,
      json('POST', { title: 'Identity Test Task' }, { 'X-Authentik-Username': 'drew' }),
      trusted
    );
    expect(taskRes.status).toBe(201);
    const task = await taskRes.json();
    taskId = task.id;
    originalCreatedAt = task.created_at;

    const commentRes = await app.request(
      `/api/tasks/${taskId}/comments`,
      json('POST', { body: 'hi' }, { 'X-Authentik-Username': 'drew' }),
      trusted
    );
    expect(commentRes.status).toBe(201);
    const comment = await commentRes.json();
    expect(comment.identity).toBe('authentik:drew');

    const envCommentRes = await app.request(
      `/api/tasks/${taskId}/comments`,
      json('POST', { body: 'hi2' }, { Authorization: `Bearer ${ENV_KEY}` }),
      untrusted
    );
    expect(envCommentRes.status).toBe(201);
    const envComment = await envCommentRes.json();
    expect(envComment.identity).toBeUndefined();
    expect('identity' in envComment).toBe(false);
  });

  it('g. ignores forged comments/project_id/created_at in a PATCH body and only applies allow-listed fields', async () => {
    const beforeTaskRes = await app.request(
      `/api/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${ENV_KEY}` } },
      untrusted
    );
    const beforeTask = await beforeTaskRes.json();
    const originalCommentCount = beforeTask.comments.length;

    const patchRes = await app.request(
      `/api/tasks/${taskId}`,
      json(
        'PATCH',
        {
          title: 'renamed',
          comments: [
            {
              id: 'zzz',
              body: 'forged',
              author: 'user',
              identity: 'authentik:drew',
              created_at: new Date().toISOString(),
            },
          ],
          project_id: 'other',
          created_at: '2000-01-01T00:00:00Z',
        },
        { Authorization: `Bearer ${ENV_KEY}` }
      ),
      untrusted
    );
    expect(patchRes.status).toBe(200);

    const afterRes = await app.request(
      `/api/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${ENV_KEY}` } },
      untrusted
    );
    expect(afterRes.status).toBe(200);
    const afterTask = await afterRes.json();

    expect(afterTask.title).toBe('renamed');
    expect(afterTask.comments.length).toBe(originalCommentCount);
    expect(afterTask.comments.some((c: { body: string }) => c.body === 'forged')).toBe(false);
    expect(afterTask.project_id).toBe(projectId);
    expect(afterTask.created_at).toBe(originalCreatedAt);
  });
});
