# ioths-legal

Public legal and contact pages for **ioths**, an offline-first note-taking app for iOS.

This repo exists because an App Store app needs a privacy policy at a URL that
resolves, and because a contact channel shouldn't require the app to run a
server or collect an account. It is deliberately small: static HTML, one
stylesheet, and a single Cloudflare Worker that turns a contact form into a
private GitHub issue.

---

## Status: unpublished on purpose

The site is finished but **not served**: `https://rndrssn.github.io/ioths-legal/`
returns 404. It must not be live while the app isn't — the Terms of Use state that
sync is a one-time in-app purchase, and the app does not ship StoreKit yet.

App Store review requires a privacy-policy URL that resolves, so republication and
app submission arrive together. At that point the in-app-purchase claim must
already be true, or the terms must be corrected first.

Checking whether it's live: **fetch the URL, don't trust the Pages settings page or
`gh api .../pages`.** Both keep reporting the last successful build (`status: built`,
source `main`) after publishing is switched off, so they read as "live" when nothing
is served. The CDN also caches pages for 10 minutes and ignores query strings, so a
`?cachebust=` trick doesn't work — check the `age` header, or just use a private
window.

---

## What's here

| Path | What it is |
| --- | --- |
| `index.html` / `de/index.html` | Privacy policy (EN / DE) |
| `terms.html` / `de/terms.html` | Terms of Use (EN / DE) |
| `impressum.html` | German legal notice (§ 5 DDG) |
| `contact.html` | Contact form — talks to the Worker |
| `style.css` | Shared design tokens and layout |
| `VERSION` | Source of truth for the legal-site version |
| `contact-worker/` | Cloudflare Worker backing the contact form |
| `AGENTS.md` / `CLAUDE.md` | Rules for AI agents working in this repo |

The pages are plain HTML with a little vanilla JavaScript. There is no
framework, no bundler, and no build step. Don't add one.

---

## How the contact form works

The form can't post to a mail server (there isn't one) and can't post straight to
GitHub (that would leak a token into a public page). So a Worker sits in the
middle and is the only component holding secrets.

```text
contact.html                  Cloudflare Worker              GitHub
(rndrssn.github.io)           (ioths-contact)                (private repo)

  user fills form
  Turnstile issues token
         │
         │  POST { subject, email, message, cf-turnstile-response }
         ├──────────────────────────────►
         │                          1. reject unless Origin is
         │                             https://rndrssn.github.io
         │                          2. rate-limit by IP (5 / 60s)
         │                          3. verify Turnstile token
         │                          4. sanitise + length-check
         │                          5. wrap message in a fenced block
         │                                    │
         │                                    │  create issue, label: contact
         │                                    ├──────────────────────────────►
         │  ◄─────────────────────────────────┤
         │       { ok } or a neutral error
```

Points that are easy to get wrong, and why they're built this way:

- **Turnstile is verified server-side.** The widget on the page proves nothing on
  its own; the Worker calls Cloudflare's `siteverify` with the secret.
- **Rate limiting happens before any expensive work** — before Turnstile, before
  GitHub. It uses Cloudflare's native per-IP limiter (configured in
  `wrangler.toml`, keyed in the Worker). Note it always *succeeds* under
  `wrangler dev`; it only enforces in production.
- **The message is wrapped in a fenced code block longer than any backtick run it
  contains**, and inline email is stripped of backticks and newlines. Issue bodies
  are Markdown, and the submitter is untrusted — without this, a message can break
  out of its block and inject content into the issue.
- **GitHub API errors are never forwarded to the client.** They can reveal repo
  and token details. The client gets a neutral failure.
- **CORS is pinned to one origin.** Not `*`.

Submissions land as private issues labelled `contact`, readable only by the
developer, and are used solely to answer the enquiry.

---

## Working on the Worker

```sh
cd contact-worker
npm install

cp .dev.vars.example .dev.vars     # then put real values in .dev.vars
npm run dev                        # wrangler dev

node --check src/index.js          # minimum check before committing
```

Secrets are **never** committed and never live in `wrangler.toml`. They are set
once, via the CLI, and exist only in Cloudflare:

```sh
wrangler secret put GITHUB_TOKEN       # fine-grained PAT, issues:write, one repo
wrangler secret put TURNSTILE_SECRET   # from the Turnstile dashboard
```

`.dev.vars` is gitignored. Keep it that way.

Deploying is `npm run deploy`, but **don't deploy unless you were asked to** —
the Worker is live infrastructure serving a public form.

---

## Changing the legal pages

Three rules carry most of the weight:

1. **EN and DE move together.** `index.html` ↔ `de/index.html`,
   `terms.html` ↔ `de/terms.html`. Never update one language alone.
2. **Say only what the app actually does.** Privacy, sync, monetization, and
   liability claims must match real app behaviour — no aspirational wording. If
   app behaviour changes, every affected page changes in the same commit.
3. **Bump `VERSION` and the visible dates.** Calendar versioning,
   `YYYY.MM.PATCH`, starting each month at `.0`. The version shows in page
   metadata on privacy, terms, impressum, and contact; the effective date changes
   on every document whose legal content actually changed. Styling-only changes
   don't need a bump.

`AGENTS.md` has the full rule set — read it before making changes here.

---

## Related

The app itself lives in the [`ioths`](https://github.com/rndrssn/ioths) repo,
which keeps its own copy of the privacy policy under `docs/legal/`. If a claim
changes, it changes in both places.
