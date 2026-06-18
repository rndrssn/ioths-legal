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

    const issueTitle = subject || 'Contact form submission';
    const issueBody  = [
      email ? `**From:** ${email}` : '**From:** *(no email provided)*',
      '',
      '**Message:**',
      '',
      message,
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
