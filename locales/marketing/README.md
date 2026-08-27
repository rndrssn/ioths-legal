# Marketing localization

The website source is English. `en.json` is generated from `index.html`; do not
edit it by hand. Each priority locale has a matching JSON catalog that stores
imported draft or reviewed targets. Review state lives in
`marketing-locales.json`; importing a complete LLM draft does not mark it
reviewed. Give a translation agent [TRANSLATION_AGENT.md](TRANSLATION_AGENT.md)
before the XLIFF, then use the shorter [translation prompt](translator-prompt.md)
as the immediate instruction.

## Translator round-trip

1. Refresh the source catalog after English copy changes:

   ```sh
   node scripts/marketing-localization.mjs sync
   ```

2. Export one locale for translation:

   ```sh
   node scripts/marketing-localization.mjs export ja /private/tmp/ioths-ja.xliff
   ```

3. Give the XLIFF, [translation prompt](translator-prompt.md), and the app's [translator brief](../../../../ioths/docs/engineering/translator-brief.md) to the translator or translation agent. Translate `<target>` only. Preserve inline HTML and attributes exactly; preserve `{generation}` exactly once.

4. Import the completed LLM draft for local preview:

   ```sh
   node scripts/marketing-localization.mjs import ja /private/tmp/ioths-ja.xliff
   ./scripts/verify.sh
   ```

5. A native reviewer checks the completed XLIFF in context, makes any changes,
   and the implementer imports it again. Japanese and Korean require native
   review before publication.

Locale status is controlled in `../marketing-locales.json`. Draft and reviewed
pages stay noindex and unlinked. Record `reviewedBy` and `reviewedOn` before
marking a locale `reviewed` or `published`; Japanese and Korean require a native
reviewer. A complete XLIFF import records `translationComplete: true` while the
locale remains `draft`; only a complete, fully reviewed catalog may be marked
`published`.
