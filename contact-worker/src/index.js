const ALLOWED_ORIGINS = new Set([
  'https://ioths-legal.pages.dev',
  'https://ioths.bedrockrebel.app',
  // Transitional — retire once the legal.bedrockrebel.app / bedrockrebel.app/support
  // redirects from the 2026-08-23 domain restructuring are confirmed retired.
  // See docs/engineering/handovers/2026-08-23-bedrockrebel-app-domain-restructuring.md
  // in the ioths repo.
  'https://legal.bedrockrebel.app',
  'https://bedrockrebel.app',
]);
const GITHUB_REPO    = 'rndrssn/ioths';
const GITHUB_API     = 'https://api.github.com';
const TURNSTILE_URL  = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const MAX_MESSAGE = 2000;
const MAX_EMAIL   = 254;
const MAX_SUBJECT = 150;
const MIN_MESSAGE = 10;
const CONTACT_TOPICS = Object.freeze({
  support: "Support",
  feedback: "Feedback",
  privacy: "Privacy",
});
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    // Preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // Only accept POST from the legal site
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, origin);
    }
    const contentLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request is too large.' }, 413, origin);
    }

    // Per-IP rate limit before any expensive work (Turnstile, GitHub).
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    const { success: underLimit } = await env.RATE_LIMITER.limit({ key: ip });
    if (!underLimit) {
      return jsonResponse({ error: 'Too many requests. Please wait a minute and try again.' }, 429, origin);
    }

    let body;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'Request is too large.' }, 413, origin);
      }
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid request.' }, 400, origin);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
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
    const topic   = contactTopic(body.topic);

    if (message.length < MIN_MESSAGE) {
      return jsonResponse({ error: 'Message is too short.' }, 400, origin);
    }

    // Issue titles render as plain text (no markdown, no @mention notifications),
    // so the subject is safe as-is. The body IS markdown — neutralise it.
    const issueTitle = "[" + topic + "] " + (subject || "Contact form submission");
    const issueBody  = [
      "**Topic:** " + topic,
      email ? `**From:** \`${escapeInline(email)}\`` : '**From:** *(no email provided)*',
      '',
      '**Message:**',
      '',
      fencedBlock(message),
    ].join('\n');

    let ghRes;
    try {
      ghRes = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization:          `Bearer ${env.GITHUB_TOKEN}`,
          'Content-Type':         'application/json',
          'User-Agent':            'ioths-contact-worker/1.0',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title:  issueTitle,
          body:   issueBody,
          labels: ['contact'],
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return jsonResponse({ error: 'Could not submit. Please try again later.' }, 502, origin);
    }

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
  try {
    const res = await fetch(TURNSTILE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function sanitise(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function contactTopic(value) {
  return typeof value === "string" && CONTACT_TOPICS[value] ? CONTACT_TOPICS[value] : CONTACT_TOPICS.support;
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
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
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
