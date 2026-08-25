import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ALLOWED_ORIGIN = 'https://ioths.bedrockrebel.app';
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const GITHUB_URL = 'https://api.github.com/repos/rndrssn/ioths/issues';
const originalFetch = globalThis.fetch;

function makeRequest({
  method = 'POST',
  origin = ALLOWED_ORIGIN,
  body,
  headers = {},
} = {}) {
  const requestHeaders = new Headers({ Origin: origin, ...headers });
  const requestBody = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
  if (requestBody !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  return new Request('https://ioths-contact.platoscave.workers.dev', {
    method,
    headers: requestHeaders,
    body: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : requestBody,
  });
}

function makeEnv({ underLimit = true } = {}) {
  return {
    GITHUB_TOKEN: 'test-github-token',
    TURNSTILE_SECRET: 'test-turnstile-secret',
    RATE_LIMITER: { limit: async () => ({ success: underLimit }) },
  };
}

async function invoke(request, { fetchImpl = async () => new Response('unexpected fetch', { status: 500 }), underLimit = true } = {}) {
  globalThis.fetch = fetchImpl;
  try {
    return await worker.fetch(request, makeEnv({ underLimit }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

test('preflight and method policy', async (t) => {
  await t.test('allows preflight only for an allowed origin', async () => {
    const response = await invoke(makeRequest({ method: 'OPTIONS' }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);

    const forbidden = await invoke(makeRequest({ method: 'OPTIONS', origin: 'https://example.invalid' }));
    assert.equal(forbidden.status, 204);
    assert.equal(forbidden.headers.get('Access-Control-Allow-Origin'), '');
  });

  await t.test('rejects disallowed origins and unsupported methods', async () => {
    const disallowed = await invoke(makeRequest({ origin: 'https://example.invalid' }));
    assert.equal(disallowed.status, 403);

    const method = await invoke(makeRequest({ method: 'GET' }));
    assert.equal(method.status, 405);
  });
});

test('request validation and rate limiting', async (t) => {
  await t.test('rejects unsupported content types and oversized requests before rate limiting', async () => {
    const contentType = await invoke(makeRequest({ body: '{}', headers: { 'Content-Type': 'text/plain' } }));
    assert.equal(contentType.status, 415);

    const oversized = await invoke(makeRequest({ body: '{}', headers: { 'Content-Length': '16385' } }));
    assert.equal(oversized.status, 413);

    const oversizedChunked = await invoke(makeRequest({ body: 'x'.repeat(16 * 1024 + 1) }));
    assert.equal(oversizedChunked.status, 413);
  });

  await t.test('returns a generic error for malformed or structurally invalid JSON', async () => {
    const malformed = await invoke(makeRequest({ body: '{' }));
    assert.equal(malformed.status, 400);
    assert.deepEqual(await responseJson(malformed), { error: 'Invalid request.' });

    const array = await invoke(makeRequest({ body: '[]' }));
    assert.equal(array.status, 400);
    assert.deepEqual(await responseJson(array), { error: 'Invalid request.' });
  });

  await t.test('enforces the rate limit before external verification', async () => {
    let fetchCalled = false;
    const response = await invoke(makeRequest({ body: {} }), {
      underLimit: false,
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response('{}');
      },
    });
    assert.equal(response.status, 429);
    assert.equal(fetchCalled, false);
  });
});

test('Turnstile validation and message policy', async (t) => {
  await t.test('rejects missing or failed Turnstile verification', async () => {
    const missing = await invoke(makeRequest({ body: { message: 'a sufficiently long message' } }));
    assert.equal(missing.status, 400);
    assert.deepEqual(await responseJson(missing), { error: 'Verification failed. Please try again.' });

    const failed = await invoke(makeRequest({ body: { turnstileToken: 'bad', message: 'a sufficiently long message' } }), {
      fetchImpl: async () => new Response('{}', { status: 403 }),
    });
    assert.equal(failed.status, 400);

    const unavailable = await invoke(makeRequest({ body: { turnstileToken: 'unavailable', message: 'a sufficiently long message' } }), {
      fetchImpl: async () => { throw new Error('Turnstile unavailable'); },
    });
    assert.equal(unavailable.status, 400);
  });

  await t.test('enforces the minimum message length after verification', async () => {
    const response = await invoke(makeRequest({ body: { turnstileToken: 'good', message: 'short' } }), {
      fetchImpl: async (url) => url === TURNSTILE_URL
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response('{}', { status: 201 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await responseJson(response), { error: 'Message is too short.' });
  });
});

test('successful submission sanitises content and creates the expected issue', async () => {
  const calls = [];
  const response = await invoke(makeRequest({
    body: {
      turnstileToken: 'good',
      topic: 'feedback',
      subject: 'Subject',
      email: 'a`b\n@example.com',
      message: 'hello\n````\n@everyone',
    },
  }), {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === TURNSTILE_URL) return new Response(JSON.stringify({ success: true }), { status: 200 });
      return new Response(JSON.stringify({ number: 123 }), { status: 201 });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { success: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, TURNSTILE_URL);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    secret: 'test-turnstile-secret',
    response: 'good',
    remoteip: '',
  });
  assert.equal(calls[1].url, GITHUB_URL);
  const issue = JSON.parse(calls[1].init.body);
  assert.equal(issue.title, '[Feedback] Subject');
  assert.deepEqual(issue.labels, ['contact']);
  assert.match(issue.body, /\*\*From:\*\* `a'b @example\.com`/);
  assert.match(issue.body, /`````\nhello\n````\n@everyone\n`````/);
});

test('upstream failures are contained', async (t) => {
  const body = { turnstileToken: 'good', message: 'a sufficiently long message' };

  await t.test('maps GitHub HTTP errors to a generic 502', async () => {
    const response = await invoke(makeRequest({ body }), {
      fetchImpl: async (url) => url === TURNSTILE_URL
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response('secret upstream details', { status: 500 }),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await responseJson(response), { error: 'Could not submit. Please try again later.' });
  });

  await t.test('maps network failures to a generic 502', async () => {
    const response = await invoke(makeRequest({ body }), {
      fetchImpl: async (url) => {
        if (url === TURNSTILE_URL) return new Response(JSON.stringify({ success: true }), { status: 200 });
        throw new Error('network failure');
      },
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await responseJson(response), { error: 'Could not submit. Please try again later.' });
  });
});
