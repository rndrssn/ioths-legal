const ALLOWED_ORIGIN = 'https://rndrssn.github.io';
const GITHUB_REPO    = 'rndrssn/ioths';
const GITHUB_API     = 'https://api.github.com';
const TURNSTILE_URL  = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const MAX_MESSAGE = 2000;
const MAX_EMAIL   = 254;
const MAX_SUBJECT = 150;
const MIN_MESSAGE = 10;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    // Preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // Only accept POST from the legal site
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Per-IP rate limit before any expensive work (Turnstile, GitHub).
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    const { success: underLimit } = await env.RATE_LIMITER.limit({ key: ip });
    if (!underLimit) {
      return jsonResponse({ error: 'Too many requests. Please wait a minute and try again.' }, 429, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request.' }, 400, origin);
    }

    // Verify Turnstile token before touching any user content
    const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, request);
    if (!turnstileOk) {
      return jsonResponse({ error: 'Verification failed. Please try again.' }, 400, origin);
    }

    // Sanitise and cap inputs — never trust client lengths
    const message = sanitise(body.message, MAX_MESSAGE);
    const email   = sanitise(body.email,   MAX_EMAIL);
    const subject = sanitise(body.subject,  MAX_SUBJECT);

    if (message.length < MIN_MESSAGE) {
      return jsonResponse({ error: 'Message is too short.' }, 400, origin);
    }

    // Issue titles render as plain text (no markdown, no @mention notifications),
    // so the subject is safe as-is. The body IS markdown — neutralise it.
    const issueTitle = subject || 'Contact form submission';
    const issueBody  = [
      email ? `**From:** \`${escapeInline(email)}\`` : '**From:** *(no email provided)*',
      '',
      '**Message:**',
      '',
      fencedBlock(message),
    ].join('\n');

    const ghRes = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization:          `Bearer ${env.GITHUB_TOKEN}`,
        'Content-Type':         'application/json',
        'User-Agent':           'ioths-contact-worker/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title:  issueTitle,
        body:   issueBody,
        labels: ['contact'],
      }),
    });

    if (!ghRes.ok) {
      // Do not forward GitHub's error body — it may contain token hints
      return jsonResponse({ error: 'Could not submit. Please try again later.' }, 502, origin);
    }

    return jsonResponse({ success: true }, 200, origin);
  },
};

async function verifyTurnstile(token, secret, request) {
  if (!token || !secret) return false;
  // Pass the visitor IP for stronger verification
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const res = await fetch(TURNSTILE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return data.success === true;
}

function sanitise(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

// Single-line fields rendered inside an inline code span. Strip backticks
// (prevents span breakout) and collapse newlines so the value stays on one line.
function escapeInline(value) {
  return value.replace(/`/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

// Wrap untrusted multi-line content in a fenced code block. GitHub does not
// parse @mentions, issue refs, or links inside code fences, so this neutralises
// notification/link injection. The fence is made longer than the longest run of
// backticks in the content so the block cannot be broken out of.
function fencedBlock(value) {
  const longestRun = (value.match(/`+/g) ?? []).reduce((m, s) => Math.max(m, s.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${value}\n${fence}`;
}

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : '';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function corsResponse(body, status, origin) {
  return new Response(body, { status, headers: corsHeaders(origin) });
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}
