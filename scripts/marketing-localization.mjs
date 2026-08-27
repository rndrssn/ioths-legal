import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesRoot = path.join(repositoryRoot, 'locales');
const marketingRoot = path.join(localesRoot, 'marketing');
const sourcePath = path.join(repositoryRoot, 'index.html');
const manifestPath = path.join(localesRoot, 'marketing-locales.json');
const sourceCatalogPath = path.join(marketingRoot, 'en.json');
const protectedTerms = ['IOTHS', 'Markdown', 'Obsidian', 'GitHub', 'GitLab', 'App Store', "Conway's Game of Life", 'YAML', 'iPhone', 'iPad', 'Files', 'Box', 'Dropbox', 'Microsoft OneDrive', 'PDF', 'ZIP', "Plato's Cave"];

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function escapeXML(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function unescapeXML(value) {
  return value.replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
}

function extractSourceCatalog(html) {
  const entries = [];
  const add = (id, source, context) => {
    if (!source.trim()) return;
    entries.push({ id, source, context });
  };

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (title) add('metadata.title', title, 'Browser title and social-card title.');

  let metaIndex = 0;
  for (const match of html.matchAll(/<meta\s+([^>]+)>/gi)) {
    const attributes = match[1];
    const name = attributes.match(/(?:name|property)="([^"]+)"/i)?.[1];
    const content = attributes.match(/content="([^"]+)"/i)?.[1];
    if (name && content && /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)$/i.test(name)) {
      add(`metadata.${name.replaceAll(':', '.')}.${metaIndex}`, content, `Metadata: ${name}.`);
      metaIndex += 1;
    }
  }

  let attributeIndex = 0;
  for (const match of html.matchAll(/<(?:img|canvas|aside|nav|div)\b[^>]*\b(?:alt|aria-label)="([^"]+)"[^>]*>/gi)) {
    add(`accessibility.${attributeIndex}`, match[1], 'Accessible description.');
    attributeIndex += 1;
  }

  let elementIndex = 0;
  const contentSource = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const match of contentSource.matchAll(/<(h1|h2|h3|p|li|button|a|span)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    add(`content.${match[1]}.${elementIndex}`, match[2], `${match[1].toUpperCase()} content. Preserve any inline HTML tags and attributes.`);
    elementIndex += 1;
  }

  const structuredDataSource = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (structuredDataSource) {
    const structuredData = JSON.parse(structuredDataSource);
    const website = structuredData['@graph']?.find((entry) => entry['@type'] === 'WebSite');
    const application = structuredData['@graph']?.find((entry) => entry['@type'] === 'SoftwareApplication');
    if (website?.description) add('structuredData.website.description', website.description, 'Schema.org WebSite description. Preserve the product claim exactly.');
    if (application?.description) add('structuredData.application.description', application.description, 'Schema.org SoftwareApplication description. Preserve the product claim exactly.');
    for (const [index, feature] of (application?.featureList ?? []).entries()) {
      add(`structuredData.application.feature.${index}`, feature, 'Schema.org SoftwareApplication feature. Keep concise and factual.');
    }
  }

  add('life.pause', 'Pause', 'Game of Life control shown while the simulation is running.');
  add('life.generation', 'Generation {generation}', 'Game of Life generation label. Keep {generation} exactly once.');
  add('localeSuggestion.prompt', 'View this page in your language', 'Browser-language suggestion. Translate naturally for the target locale.');
  add('localeSuggestion.language', 'your language', 'Link label for the translated marketing page.');
  add('localeSuggestion.dismiss', 'Stay in English', 'Dismissal action for the browser-language suggestion.');
  add('localeSuggestion.aria', 'Language preference', 'Accessible label for the browser-language suggestion.');
  return entries;
}

function manifest() {
  return readJSON(manifestPath);
}

function localeCatalogPath(locale) {
  return path.join(marketingRoot, `${locale}.json`);
}

function validateMarkup(source, target, id) {
  const markup = (value) => (value.match(/<\/?[a-z][^>]*>/gi) ?? []).sort();
  assert.deepEqual(markup(target), markup(source), `${id} changes inline HTML. Preserve tags and attributes exactly.`);
  for (const term of protectedTerms) {
    const occurrences = (value) => value.split(term).length - 1;
    assert.equal(occurrences(target), occurrences(source), `${id} must preserve ${term} exactly`);
  }
}

function sync() {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const previousSourceCatalog = fs.existsSync(sourceCatalogPath) ? readJSON(sourceCatalogPath) : { entries: [] };
  const sourceCatalog = {
    locale: 'en',
    sourceDigest: digest(html),
    entries: extractSourceCatalog(html),
  };
  const previousSources = new Map(previousSourceCatalog.entries.map((entry) => [entry.id, entry.source]));
  writeJSON(sourceCatalogPath, sourceCatalog);

  for (const locale of manifest().locales) {
    const existing = fs.existsSync(localeCatalogPath(locale.code)) ? readJSON(localeCatalogPath(locale.code)) : { translations: {} };
    const canMigrate = existing.sourceDigest === previousSourceCatalog.sourceDigest;
    const translations = {};
    for (const entry of sourceCatalog.entries) {
      const translation = existing.translations?.[entry.id];
      if (canMigrate && translation && previousSources.get(entry.id) === entry.source) translations[entry.id] = translation;
    }
    writeJSON(localeCatalogPath(locale.code), {
      locale: locale.code,
      sourceDigest: sourceCatalog.sourceDigest,
      translations,
      translationComplete: sourceCatalog.entries.every((entry) => translations[entry.id]?.trim()),
    });
  }
}

function loadSourceCatalog() {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const catalog = readJSON(sourceCatalogPath);
  assert.equal(catalog.sourceDigest, digest(html), 'Marketing source changed. Run: node scripts/marketing-localization.mjs sync');
  return catalog;
}

function exportXLIFF(locale, outputPath) {
  const sourceCatalog = loadSourceCatalog();
  const targetCatalog = readJSON(localeCatalogPath(locale));
  const units = sourceCatalog.entries.map((entry) => {
    const target = targetCatalog.translations[entry.id] ?? '';
    return `      <unit id="${entry.id}">\n        <notes><note>${escapeXML(entry.context)}</note></notes>\n        <segment>\n          <source>${escapeXML(entry.source)}</source>\n          <target>${escapeXML(target)}</target>\n        </segment>\n      </unit>`;
  }).join('\n');
  const xliff = `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="2.1" srcLang="en" trgLang="${locale}" xmlns="urn:oasis:names:tc:xliff:document:2.1">\n  <file id="marketing" original="index.html">\n${units}\n  </file>\n</xliff>\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xliff);
}

function importXLIFF(locale, inputPath) {
  const sourceCatalog = loadSourceCatalog();
  const input = fs.readFileSync(inputPath, 'utf8');
  assert.match(input, new RegExp(`trgLang="${locale}"`), `XLIFF target locale must be ${locale}`);
  const targets = new Map();
  for (const match of input.matchAll(/<unit id="([^"]+)">[\s\S]*?<source>([\s\S]*?)<\/source>[\s\S]*?<target>([\s\S]*?)<\/target>[\s\S]*?<\/unit>/g)) {
    targets.set(match[1], { source: unescapeXML(match[2]), target: unescapeXML(match[3]) });
  }
  assert.equal(targets.size, sourceCatalog.entries.length, 'XLIFF must retain every translation unit. Export a fresh file if units are missing.');

  const translations = {};
  for (const entry of sourceCatalog.entries) {
    const unit = targets.get(entry.id);
    assert.equal(unit?.source, entry.source, `${entry.id} source changed in XLIFF`);
    if (!unit.target.trim()) continue;
    validateMarkup(entry.source, unit.target, entry.id);
    if (entry.id === 'life.generation') assert.equal((unit.target.match(/\{generation\}/g) ?? []).length, 1, 'life.generation must retain {generation} exactly once');
    translations[entry.id] = unit.target;
  }

  writeJSON(localeCatalogPath(locale), {
    locale,
    sourceDigest: sourceCatalog.sourceDigest,
    translations,
    translationComplete: sourceCatalog.entries.every((entry) => translations[entry.id]?.trim()),
  });
}

function command() {
  const [action, locale, file] = process.argv.slice(2);
  if (action === 'sync') return sync();
  if (action === 'export') return exportXLIFF(locale, path.resolve(file));
  if (action === 'import') return importXLIFF(locale, path.resolve(file));
  throw new Error('Usage: sync | export <locale> <output.xliff> | import <locale> <input.xliff>');
}

command();
