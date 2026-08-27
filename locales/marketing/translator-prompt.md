# Marketing XLIFF translation prompt

Translate the `<target>` values in this XLIFF from English into the declared
target locale. Return the entire XLIFF, with every `<unit>`, `<source>`, `id`,
note, and structural element unchanged.

- Translate the product narrative naturally; do not translate word-for-word.
- Preserve `IOTHS`, `Markdown`, `Obsidian`, `GitHub`, `GitLab`, `App Store`,
  `Conway's Game of Life`, and URLs exactly.
- Preserve all inline HTML tags, attributes, and `{generation}` exactly. Do not
  add tags, Markdown, comments, claims, features, or links.
- Keep privacy, storage, pricing, and availability claims no stronger than the
  English source.
- Japanese: use a clear, calm です・ます style. Korean: use a clear, calm 해요체
  style. Follow the shared [translator brief](../../../../ioths/docs/engineering/translator-brief.md) for terminology and tone.
- This is a draft. A native reviewer must review Japanese and Korean before the
  locale may be published.
