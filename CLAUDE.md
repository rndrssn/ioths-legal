# CLAUDE.md

Agent configuration for Claude Code in this repository.

The rules for this repo live in `AGENTS.md`. It is the single source of truth
for every agent working here — do not restate its rules in this file, or the two
will drift apart and the next reader won't know which one is current.

@AGENTS.md

Read `README.md` for what this repo is and how the contact Worker fits together.

---

## Before you touch anything

This repository is **public**, and it serves the legal pages a real App Store app
points at. Two consequences that are easy to miss:

- **Anything committed here is world-readable, permanently.** Git history keeps
  it even after a delete commit. Never commit note content, vault files, tokens,
  `.dev.vars`, or private data. This repo is not a notes-vault sync target and
  must never be configured as one.
- **The pages are legal documents, not marketing copy.** A wrong claim about
  privacy, sync, monetization, or liability is a real problem, not a typo. If you
  cannot verify a claim against actual app behaviour, do not write it.

---

## Publishing state

Cloudflare Pages is the production host. Do not re-enable GitHub Pages. Static
site and contact Worker deployments remain explicit owner-authorized actions;
see `README.md` for the staging and deployment commands.

---

## Verifying changes

- Static pages: read the changed page top to bottom. Check that EN and DE still
  match section for section, that `VERSION` and the visible version and effective
  dates agree, and that every `target="_blank"` link carries
  `rel="noopener noreferrer"`.
- Worker: `node --check contact-worker/src/index.js` at minimum.
- **Never run `wrangler deploy`** unless explicitly asked. The Worker is live
  infrastructure behind a public form.

---

## Cross-repo consistency

The app repo (`ioths`) keeps its own copy of the privacy policy under
`docs/legal/`. A claim that changes here usually has to change there too, and
vice versa. Check both before calling a legal change done.
