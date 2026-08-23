# ioths-legal

Public legal and contact pages for **ioths**, an offline-first note-taking app for iOS.

This repo exists because an App Store app needs a privacy policy at a URL that
resolves, and because a contact channel shouldn't require the app to run a
server or collect an account. It is deliberately small: static HTML, one
stylesheet, and a single Cloudflare Worker that turns a contact form into a
private GitHub issue.

---

## Production hosting

The production site is deployed to Cloudflare Pages at
`https://ioths.bedrockrebel.app/` — the ioths product zone, hosting the marketing
landing page, legal pages, and support/contact in one place. The checked-in
`scripts/build-pages.sh` stages only the public HTML, CSS, headers, and redirects
in `dist/`; repository guidance, Worker source, and development files are never
uploaded as static assets.

This replaces the earlier split between `legal.bedrockrebel.app` (legal pages)
and `bedrockrebel.app/support` (contact) — see
`docs/engineering/handovers/2026-08-23-bedrockrebel-app-domain-restructuring.md`
in the `ioths` repo for the full migration record. Both old hosts must keep
redirecting to their new paths under `ioths.bedrockrebel.app` for a transition
period; that redirect configuration lives in Cloudflare, not this repo. The
legacy `ioths-legal.pages.dev` hostname also remains available during cutover.
App and documentation links use the `ioths.bedrockrebel.app` custom domain.

---

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | Marketing landing page (the only indexed page here) |
| `legal/privacy.html` / `legal/de/privacy.html` | Privacy policy (EN / DE) |
| `legal/terms.html` / `legal/de/terms.html` | Terms of Use (EN / DE) |
| `legal/impressum.html` | German legal notice (§ 5 DDG) |
| `support.html` | Contact/support form — talks to the Worker |
| `style.css` | Shared design tokens and layout |
| `favicon-16x16.png` / `favicon-32x32.png` / `apple-touch-icon.png` | Site favicon, referenced on every page |
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
support.html                  Cloudflare Worker              GitHub
(Pages/custom domain)          (ioths-contact)                (private repo)

  user fills form
  Turnstile issues token
         │
         │  POST { topic, subject, email, message, turnstileToken }
         ├──────────────────────────────►
         │                          1. reject unless Origin is one of the
         │                             two migration hostnames
         │                          2. rate-limit by IP (5 / 60s)
         │                          3. verify Turnstile token
         │                          4. sanitise + length-check
         │                          5. wrap message in a fenced block
         │                                    │
         │                                    │  create issue, label: contact
         │                                    ├──────────────────────────────►
         │  ◄─────────────────────────────────┤
         │       { success: true } or a neutral error
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

Submissions land as private issues labelled `contact`, with the validated topic shown in the issue title and body, readable only by the developer, and are used solely to answer the enquiry.

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

The static site is staged and deployed separately:

```sh
./scripts/build-pages.sh
./contact-worker/node_modules/.bin/wrangler pages deploy ./dist --project-name=ioths-legal
```

---

## Changing the legal pages

Three rules carry most of the weight:

1. **EN and DE move together.** `legal/privacy.html` ↔ `legal/de/privacy.html`,
   `legal/terms.html` ↔ `legal/de/terms.html`. Never update one language alone.
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
