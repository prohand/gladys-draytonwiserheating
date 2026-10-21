import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createHubClient,
  hubRequiresHttps,
  parseFirmware,
  splitHost,
  HUB_ERRORS,
} from '../src/wiser/client.js';

// A local HTTP server playing the hub (loopback only, no network).
async function startHub(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { host: `127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

const readBody = (request) =>
  new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(body));
  });

test('the client sends the secret header and reads the domain', async () => {
  const seen = [];
  const hub = await startHub((request, response) => {
    seen.push({ method: request.method, url: request.url, secret: request.headers.secret });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ System: { ActiveSystemVersion: '3.14.0' }, Room: [] }));
  });
  try {
    const client = createHubClient({ host: hub.host, secret: 's3cr3t', protocol: 'http' });
    const domain = await client.getDomain();
    assert.equal(domain.System.ActiveSystemVersion, '3.14.0');
    assert.deepEqual(seen, [{ method: 'GET', url: '/data/v2/domain/', secret: 's3cr3t' }]);
  } finally {
    await hub.close();
  }
});

test('a command is a JSON PATCH under /data/v2/domain/', async () => {
  let received;
  const hub = await startHub(async (request, response) => {
    received = {
      method: request.method,
      url: request.url,
      type: request.headers['content-type'],
      body: await readBody(request),
    };
    response.end('{}');
  });
  try {
    const client = createHubClient({ host: hub.host, secret: 'x', protocol: 'http' });
    await client.patch('Room/3', { Mode: 'Auto' });
    assert.deepEqual(received, {
      method: 'PATCH',
      url: '/data/v2/domain/Room/3',
      type: 'application/json',
      body: '{"Mode":"Auto"}',
    });
  } finally {
    await hub.close();
  }
});

test('a refused secret is told apart from a hub that does not answer', async () => {
  const hub = await startHub((request, response) => {
    response.statusCode = 401;
    response.end();
  });
  try {
    const client = createHubClient({ host: hub.host, secret: 'wrong', protocol: 'http' });
    await assert.rejects(client.getDomain(), { code: HUB_ERRORS.UNAUTHORIZED });
  } finally {
    await hub.close();
  }
  // Nothing listens on this port any more.
  const gone = createHubClient({ host: hub.host, secret: 'x', protocol: 'http' });
  await assert.rejects(gone.getDomain(), { code: HUB_ERRORS.UNREACHABLE });
});

test('an answer that is not JSON is an invalid answer, not a crash', async () => {
  const hub = await startHub((request, response) => response.end('<html>'));
  try {
    const client = createHubClient({ host: hub.host, secret: 'x', protocol: 'http' });
    await assert.rejects(client.getDomain(), { code: HUB_ERRORS.INVALID });
  } finally {
    await hub.close();
  }
});

test('no address or no secret: not configured, nothing sent', async () => {
  let calls = 0;
  const client = createHubClient({
    host: '',
    secret: 'x',
    transport: async () => {
      calls += 1;
      return { status: 200, body: '{}' };
    },
  });
  await assert.rejects(client.getDomain(), { code: HUB_ERRORS.NOT_CONFIGURED });
  assert.equal(calls, 0);
});

test('requests go out one at a time', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const transport = async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    inFlight -= 1;
    return { status: 200, body: '{}' };
  };
  const client = createHubClient({ host: 'hub', secret: 'x', transport });
  await Promise.all([client.patch('Room/1', {}), client.patch('Room/2', {}), client.getDomain()]);
  assert.equal(maxInFlight, 1);
});

test('auto switches to HTTPS when the hub says so, or when HTTP is refused', async () => {
  const schemes = [];
  const recentHub = createHubClient({
    host: 'hub',
    secret: 'x',
    transport: async ({ protocol }) => {
      schemes.push(protocol);
      return {
        status: 200,
        body: JSON.stringify({ System: { HardwareGeneration: 2, ActiveSystemVersion: '4.42.30' } }),
      };
    },
  });
  await recentHub.getDomain();
  await recentHub.getDomain();
  assert.deepEqual(schemes, ['http', 'https']);

  const httpsOnly = createHubClient({
    host: 'hub',
    secret: 'x',
    transport: async ({ protocol }) => {
      if (protocol === 'http') {
        throw new Error('connect ECONNREFUSED');
      }
      return { status: 200, body: '{}' };
    },
  });
  await httpsOnly.getDomain();
  assert.equal(httpsOnly.scheme, 'https');
});

test('a forced protocol is kept', async () => {
  const client = createHubClient({
    host: 'hub',
    secret: 'x',
    protocol: 'http',
    transport: async () => ({
      status: 200,
      body: JSON.stringify({ System: { HardwareGeneration: 2, ActiveSystemVersion: '5.0.0' } }),
    }),
  });
  await client.getDomain();
  assert.equal(client.scheme, 'http');
});

test('firmware and host helpers', () => {
  assert.deepEqual(parseFirmware('4.42.22-b3'), [4, 42, 22]);
  assert.equal(hubRequiresHttps({ HardwareGeneration: 2, ActiveSystemVersion: '4.42.22' }), true);
  assert.equal(hubRequiresHttps({ HardwareGeneration: 2, ActiveSystemVersion: '4.40.0' }), false);
  assert.equal(hubRequiresHttps({ HardwareGeneration: 1, ActiveSystemVersion: '5.0.0' }), false);
  assert.deepEqual(splitHost('192.168.1.40'), { hostname: '192.168.1.40', port: undefined });
  assert.deepEqual(splitHost('wiserheat.lan:8080'), { hostname: 'wiserheat.lan', port: 8080 });
});
