import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repositoryRoot, 'dist');
const source = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'locales/marketing-locales.json'), 'utf8'));
const sourceCatalog = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'locales/marketing/en.json'), 'utf8'));
const sourceDigest = crypto.createHash('sha256').update(source).digest('hex');
const siteURL = 'https://ioths.bedrockrebel.app';

assert.equal(sourceCatalog.sourceDigest, sourceDigest, 'Marketing source changed. Run: node scripts/marketing-localization.mjs sync');

const targetCatalogs = new Map(manifest.locales.map((locale) => [
  locale.code,
  JSON.parse(fs.readFileSync(path.join(repositoryRoot, `locales/marketing/${locale.code}.json`), 'utf8')),
]));
const publishedLocales = manifest.locales.filter((locale) => locale.status === 'published');
const publishedPromptLocales = publishedLocales.map((locale) => {
  const translations = targetCatalogs.get(locale.code).translations;
  return {
    code: locale.code,
    prompt: translations['localeSuggestion.prompt'],
    language: translations['localeSuggestion.language'],
    dismiss: translations['localeSuggestion.dismiss'],
    aria: translations['localeSuggestion.aria'],
  };
});
const alternateLinks = [
  `<link rel="alternate" hreflang="en" href="${siteURL}/">`,
  `<link rel="alternate" hreflang="x-default" href="${siteURL}/">`,
  ...publishedLocales.map((locale) => `<link rel="alternate" hreflang="${locale.code}" href="${siteURL}/${locale.code}/">`),
].join('\n  ');

const rootPath = path.join(outputRoot, 'index.html');
const builtRoot = fs.readFileSync(rootPath, 'utf8');
fs.writeFileSync(rootPath, builtRoot.replace(
  '<script type="application/json" id="marketing-locale-config">{"published":[]}</script>',
  `<script type="application/json" id="marketing-locale-config">${JSON.stringify({ published: publishedPromptLocales })}</script>`
));

if (publishedLocales.length > 0) {
  fs.writeFileSync(
    rootPath,
    fs.readFileSync(rootPath, 'utf8').replace('<link rel="canonical" href="https://ioths.bedrockrebel.app/">', `${alternateLinks}\n  <link rel="canonical" href="${siteURL}/">`)
  );

  const sitemapPath = path.join(outputRoot, 'sitemap.xml');
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const lastModified = sitemap.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? new Date().toISOString().slice(0, 10);
  const localeURLs = publishedLocales.map((locale) => `  <url>\n    <loc>${siteURL}/${locale.code}/</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>`).join('\n');
  fs.writeFileSync(sitemapPath, sitemap.replace('</urlset>', `${localeURLs}\n</urlset>`));
}

for (const locale of manifest.locales) {
  const targetCatalog = targetCatalogs.get(locale.code);
  assert.equal(targetCatalog.sourceDigest, sourceDigest, `${locale.code} catalog is out of date. Run: node scripts/marketing-localization.mjs sync`);
  const isPublished = locale.status === 'published';
  const translationComplete = sourceCatalog.entries.every((entry) => targetCatalog.translations[entry.id]?.trim());
  assert.equal(targetCatalog.translationComplete, translationComplete, `${locale.code} has stale translation-completeness metadata`);
  if (['reviewed', 'published'].includes(locale.status)) {
    assert.ok(translationComplete, `${locale.code} cannot be ${locale.status} with untranslated units`);
  }

  const outputDirectory = path.join(outputRoot, locale.code);
  let output = source;
  for (const entry of sourceCatalog.entries) {
    if (['life.pause', 'life.generation'].includes(entry.id)) continue;
    const translation = targetCatalog.translations[entry.id];
    if (translation) output = output.replace(entry.source, () => translation);
  }
  const translationFor = (sourceText) => {
    const id = sourceCatalog.entries.find((entry) => entry.source === sourceText)?.id;
    return id ? targetCatalog.translations[id] : undefined;
  };
  const startLabel = translationFor('Let it evolve');
  if (startLabel) output = output.replaceAll("'Let it evolve'", JSON.stringify(startLabel));
  const pauseLabel = translationFor('Pause');
  if (pauseLabel) output = output.replaceAll("'Pause'", JSON.stringify(pauseLabel));
  const generationLabel = translationFor('Generation {generation}');
  if (generationLabel) {
    const [before, after] = generationLabel.split('{generation}');
    output = output.replace('status.textContent = `Generation ${generation}`;', `status.textContent = ${JSON.stringify(before)} + generation + ${JSON.stringify(after)};`);
  }
  output = output
    .replace('<html lang="en"', `<html lang="${translationComplete ? locale.code : 'en'}" data-target-locale="${locale.code}" data-translation-status="${locale.status}"`)
    .replace(/<meta name="robots" content="[^"]+">/, isPublished ? '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">' : '<meta name="robots" content="noindex, follow">')
    .replace(
      '<link rel="canonical" href="https://ioths.bedrockrebel.app/">',
      `${isPublished ? `${alternateLinks}\n  ` : ''}<link rel="canonical" href="${siteURL}/${locale.code}/">\n  <meta name="ioths:translation-status" content="${locale.status}">`
    );
  if (translationComplete) {
    output = output
      .replace(`<meta property="og:url" content="${siteURL}/">`, `<meta property="og:url" content="${siteURL}/${locale.code}/">`)
      .replaceAll(`"url": "${siteURL}/"`, `"url": "${siteURL}/${locale.code}/"`)
      .replaceAll(`"@id": "${siteURL}/#`, `"@id": "${siteURL}/${locale.code}/#`)
      .replace('"inLanguage": "en"', `"inLanguage": "${locale.code}"`);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), output);
}
