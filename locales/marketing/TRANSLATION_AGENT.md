# IOTHS marketing translation agent guide

## Your role

You are preparing a **draft translation** of the IOTHS marketing landing page.
You do not publish a locale, change the English source, alter product claims, or
make SEO decisions. A native reviewer signs off the completed translation before
it can be published; this is mandatory for Japanese and Korean.

## Product context

IOTHS is a private, offline-first Markdown app for iPhone and iPad. It is for
people who already value plain text and readable, portable files. Notes begin as
small observations, can acquire checklists, and can then become active work and
a personal board. The Conway's Game of Life element is a playful reference to
emergence, not a claim that the app predicts or models a person's work.

The intended voice is calm, precise, private, and quietly curious. It should
not sound like enterprise project-management software, productivity hype, or a
technical specification. Prefer natural target-language copy over literal
English phrasing.

Do not introduce or strengthen claims about privacy, storage, pricing,
availability, compatibility, AI, or the App Store. The English source is the
complete authority for those facts.

## Terms to preserve

Keep these proper names and technical terms unchanged unless the target language
has an established standard rendering:

- IOTHS
- Markdown
- Obsidian
- GitHub
- GitLab
- App Store
- Conway's Game of Life
- YAML
- iPhone and iPad
- Files, Box, Dropbox, and Microsoft OneDrive
- PDF and ZIP
- Plato's Cave

Use the shared [translator brief](../../../../ioths/docs/engineering/translator-brief.md)
for approved terminology and the Japanese/Korean writing style. In particular,
use Japanese です・ます style and Korean 해요체.

## Translation workflow

The English source is extracted into `en.json`. It is generated from
`index.html`; never edit it directly. Each target locale has a JSON catalog
(`ja.json`, `ko.json`, and so on), but agents exchange translations through
XLIFF so every unit has a stable ID and context note.

1. Export one locale:

   ```sh
   node scripts/marketing-localization.mjs export ja /private/tmp/ioths-ja.xliff
   ```

2. Translate only each `<target>` value in the XLIFF.

3. Return the entire XLIFF. Keep every `<unit>`, `id`, `<source>`, `<note>`,
   and XML structure unchanged.

4. Import the complete LLM draft to generate a local, non-indexed preview:

   ```sh
   node scripts/marketing-localization.mjs import ja /private/tmp/ioths-ja.xliff
   ```

5. A native reviewer reviews the XLIFF and generated page in context, makes any
   corrections, and the implementer imports the reviewed XLIFF again.

6. Only after that review, the implementer records `reviewedBy` and `reviewedOn` in
   `locales/marketing-locales.json`, runs `./scripts/verify.sh`, and changes
   the locale to `published` only after a complete review.

## XLIFF invariants

- Preserve all inline HTML tags and their attributes exactly. You may move them
  with their associated words when grammar requires it, but do not edit, remove,
  or add tags or URLs.
- Preserve `{generation}` exactly once in the Game of Life generation label.
- Do not add Markdown, comments, explanations, alternative translations, or
  untranslated English outside proper names.
- Fill every `<target>`; a partial catalog cannot be published.
- Do not translate the source, context notes, IDs, XML declaration, or locale
  declaration.

The import and site validation reject missing units, changed English source,
altered inline markup, stale catalogs, incomplete published locales, and broken
SEO output. Draft and reviewed locales remain unlinked and `noindex`; only a
published locale receives `hreflang` and a sitemap entry.
