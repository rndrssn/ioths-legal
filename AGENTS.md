# AGENTS.md

Agent instructions for this repository.

---

## Project

**ioths-legal** hosts the public legal and contact pages for ioths, an offline-first iOS note-taking app.

The repository contains:

- Marketing landing page: `index.html` (indexed, unlike everything else here)
- Static legal pages: `legal/privacy.html`, `legal/terms.html`, `legal/de/privacy.html`, `legal/de/terms.html`, and `legal/impressum.html`
- Support/contact page: `support.html`
- Shared styling: `style.css`
- Cloudflare Worker contact backend: `contact-worker/`

All internal links use root-relative absolute paths (`/legal/privacy.html`, `/support.html`, `/`), not relative paths — this matters once pages are nested under `legal/` and `legal/de/`. Since 2026-08-23 this site is the `ioths.bedrockrebel.app` product zone; see `docs/engineering/handovers/2026-08-23-bedrockrebel-app-domain-restructuring.md` in the `ioths` repo for the full migration record and what remains owner-executed (Cloudflare custom domain, redirects from the old `legal.bedrockrebel.app` / `bedrockrebel.app/support` hosts, App Store Connect fields).

The legal pages are intentionally static HTML/CSS with a small amount of vanilla JavaScript. The contact backend is a Cloudflare Worker that creates private GitHub issues from form submissions.

Ignore documentation inside `node_modules/`; it belongs to dependencies, not this project.

---

## Content Rules

- Keep legal statements accurate and conservative. Do not invent privacy, sync, monetization, or liability claims.
- Privacy policy and Terms of Use must stay consistent with each other and with current ioths app behavior.
- The core privacy promise is: note content stays on the user's device unless the user explicitly activates an optional storage/sync destination.
- Never claim that the developer can read, process, sell, or train models on note content.
- Contact form data is different from note data. The contact form may collect a message and optional email address, stored as a private GitHub issue solely to respond to the enquiry.
- If analytics, sync destinations, in-app purchases, Turnstile, Cloudflare, GitHub, or data retention behavior changes, update every affected legal page in the same change.
- External service references must identify the service and link to the relevant privacy policy or terms where the existing page pattern does so.
- Keep effective dates current when making material legal-content changes.

---

## Versioning Rules

- The root `VERSION` file is the source of truth for the public legal-site version.
- Use `YYYY.MM.PATCH` calendar versions, starting each month at `.0` and incrementing `PATCH` for additional changes in the same month.
- Show the current version in visible page metadata on the privacy policy, Terms of Use, Impressum, and contact page.
- Bump the version when legal content, contact form behavior, contact Worker behavior, data processors, analytics disclosure, Turnstile behavior, sync claims, or monetization claims change.
- Update visible effective dates on every changed legal document in the same change.
- Static styling-only changes do not require a version bump unless they change legal meaning, contact behavior, or accessibility of the legal pages.

---

## Localization Rules

- English and German legal pages must stay in sync:
  - `legal/privacy.html` ↔ `legal/de/privacy.html`
  - `legal/terms.html` ↔ `legal/de/terms.html`
- Update both languages in the same change unless the task explicitly asks for one language only.
- Preserve proper nouns and service names: `ioths`, `TelemetryDeck`, `Obsidian`, `iCloud`, `GitHub`, `Cloudflare`, `Turnstile`, `Markdown`.
- Preserve legal meaning over literal translation.
- `legal/impressum.html` is German legal notice content. Do not remove it or hide the underlying provider/contact facts.
- Language switch links must continue to point between corresponding EN/DE pages.

---

## Static Site Rules

- Use plain HTML, CSS, and minimal vanilla JavaScript. Do not add a frontend framework, bundler, or build step unless the task explicitly requires it.
- Keep shared visual styling in `style.css` and use its existing design tokens for colors, spacing, radii, and typography.
- Keep page structure simple: `header`, `main`, `section`, and `footer`.
- Keep `<meta name="robots" content="noindex">` on every legal and support page unless the user explicitly asks to change indexing behavior. The marketing landing page (`index.html`) is the deliberate exception — it must not carry `noindex`.
- The landing page must never name iCloud as the paid Files-folder capability, and must never capitalize or brand "Personal Kanban" as a proper noun (it's an actively-commercialized third-party methodology name). See `docs/product/app-store-listing.md` in the `ioths` repo for the full rationale — this site's landing copy must stay consistent with that document.
- External links that open a new tab must use `rel="noopener noreferrer"`.
- Do not put secrets, access tokens, private addresses beyond the existing Impressum content, or hidden operational notes in static HTML.
- Keep contact form validation messages user-facing, short, and content-neutral.

---

## Contact Worker Rules

- The contact Worker lives in `contact-worker/src/index.js`.
- Cloudflare Worker config lives in `contact-worker/wrangler.toml`.
- The Worker accepts requests only from an explicit allowlist in `ALLOWED_ORIGINS`. As of the 2026-08-23 domain restructuring this is `https://ioths-legal.pages.dev` and `https://ioths.bedrockrebel.app`, plus the transitional `https://legal.bedrockrebel.app` and `https://bedrockrebel.app` — remove the transitional origins once their redirects are confirmed retired.
- Keep CORS narrow. Do not replace the fixed allowed-origin set with `*`.
- Only `POST` and `OPTIONS` are valid request methods.
- Rate-limit before expensive or external work.
- Verify Cloudflare Turnstile before processing user-submitted content.
- Keep server-side length caps and minimum message validation. Client-side limits are not sufficient.
- Never trust client input, including subject, email, message, Turnstile token, or request origin.
- Preserve markdown-injection protection:
  - Strip backticks and newlines from inline email rendering.
  - Wrap untrusted message content in a fenced code block longer than any backtick run in the message.
- Do not forward GitHub API error bodies to clients; they may reveal operational details.
- GitHub issues created by the Worker must remain private-repo contact submissions with the `contact` label.
- The GitHub personal access token and Turnstile secret must be Wrangler secrets only. Never commit `.dev.vars` or real secret values.
- `contact-worker/.dev.vars.example` may contain placeholders only.

---

## Dependency Rules

- Commit `contact-worker/package-lock.json` when dependency versions change.
- Do not commit `node_modules/`.
- Do not add runtime dependencies unless they are clearly needed for the contact Worker.
- Prefer built-in Web APIs available in Cloudflare Workers over additional packages.
- Wrangler is a development dependency for deployment and local development.

---

## Verification Rules

- Before committing or deploying either the Pages site or the contact Worker, run the complete local gate from the repository root:

```sh
./scripts/verify.sh
```

The gate syntax-checks the Worker, runs its native Node test suite, rebuilds `dist`, verifies the build manifest and source-to-build asset parity, checks root-relative links, inline JavaScript, image alt text, SEO indexing metadata, JSON-LD, redirects, robots, security headers, and whitespace. It also validates the sitemap when `xmllint` is installed. A failed gate blocks both commit and deployment.

- Run `./scripts/verify.sh` again after the final source or asset change. Do not rely on a partial command or an earlier build.
- For contact Worker changes, the focused test command is:

```sh
(cd contact-worker && npm test)
```

- For static HTML/CSS-only changes, the static checks in `./scripts/verify.sh` replace ad-hoc manual link checks; manually inspect the changed page structure and responsive behavior as well.
- For dependency or Wrangler config changes, run the relevant npm command from `contact-worker/` and confirm no secrets are printed.
- Never run commands that deploy (`wrangler deploy`) unless the user explicitly asks.
- Never paste real tokens, Turnstile secrets, or GitHub API responses containing sensitive details into logs or commits.

---

## Git Rules

- Keep commits focused: legal content, static site styling, and Worker backend changes should be separated when practical.
- Do not commit generated dependency folders, local env files, or private test artifacts.
- Before committing, check `git status --short` and verify that only intentional files are staged.
