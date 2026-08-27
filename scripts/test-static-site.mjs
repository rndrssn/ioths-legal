import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repositoryRoot, 'dist');
const localeManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'locales/marketing-locales.json'), 'utf8'));
const marketingSource = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'locales/marketing/en.json'), 'utf8'));
const hasPublishedLocale = localeManifest.locales.some((locale) => locale.status === 'published');
const protectedTranslationTerms = ['IOTHS', 'Markdown', 'Obsidian', 'GitHub', 'GitLab', 'App Store', "Conway's Game of Life", 'YAML', 'iPhone', 'iPad', 'Files', 'Box', 'Dropbox', 'Microsoft OneDrive', 'PDF', 'ZIP', "Plato's Cave"];

function filesUnder(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) return filesUnder(path.join(directory, entry.name), relativePath);
    return [relativePath];
  });
}

const htmlPages = filesUnder(outputRoot).filter((file) => file.endsWith('.html'));
const expectedFiles = [
  'index.html', '404.html', 'support.html', 'robots.txt', 'sitemap.xml', 'style.css', '_headers', '_redirects',
  'favicon-16x16.png', 'favicon-32x32.png', 'favicon-64x64.png', 'apple-touch-icon.png', 'icon-why.png', 'icon-why-240.png',
  'legal/privacy.html', 'legal/terms.html', 'legal/impressum.html', 'legal/de/privacy.html', 'legal/de/terms.html',
];

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(repositoryRoot, relativePath))).digest('hex');
}

for (const relativePath of expectedFiles) {
  assert.ok(fs.existsSync(path.join(outputRoot, relativePath)), `build is missing ${relativePath}`);
  if (hasPublishedLocale && ['index.html', 'sitemap.xml'].includes(relativePath)) continue;
  assert.equal(sha256(relativePath), sha256(path.join('dist', relativePath)), `build differs from source: ${relativePath}`);
}

for (const relativePath of filesUnder(path.join(repositoryRoot, 'assets'))) {
  const sourcePath = path.join('assets', relativePath);
  assert.ok(fs.existsSync(path.join(outputRoot, sourcePath)), `build is missing ${sourcePath}`);
  assert.equal(sha256(sourcePath), sha256(path.join('dist', sourcePath)), `build differs from source: ${sourcePath}`);
}

for (const page of htmlPages) {
  const html = read(path.join('dist', page));
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const url = match[1];
    if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/#')) continue;
    const cleanUrl = url.split(/[?#]/)[0];
    const candidates = [cleanUrl, cleanUrl.endsWith('/') ? `${cleanUrl}index.html` : `${cleanUrl}.html`];
    assert.ok(candidates.some((candidate) => fs.existsSync(path.join(outputRoot, candidate))), `${page} links to missing ${cleanUrl}`);
  }
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    assert.match(match[1], /\balt\s*=/, `${page} contains an image without alt text`);
  }
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    if (!/\btarget\s*=\s*["']_blank["']/i.test(match[1])) continue;
    const rel = match[1].match(/\brel\s*=\s*["']([^"']*)["']/i)?.[1].toLowerCase().split(/\s+/) ?? [];
    assert.ok(rel.includes('noopener') && rel.includes('noreferrer'), `${page} has a new-tab link without noopener noreferrer`);
  }
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type=["']application\/(?:ld\+)?json["']/i.test(match[1]) || !match[2].trim()) continue;
    assert.doesNotThrow(() => Function(match[2]), `${page} contains invalid inline JavaScript`);
  }
}

const index = read('dist/index.html');
assert.doesNotMatch(index, /<meta[^>]+name=["']robots["'][^>]+noindex/i, 'index.html must remain indexable');
assert.match(index, /rel=["']canonical["']/i, 'index.html needs a canonical URL');
assert.match(index, /application\/ld\+json/i, 'index.html needs JSON-LD');
assert.doesNotThrow(() => JSON.parse(index.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)[1]), 'JSON-LD must be valid JSON');

assert.equal(localeManifest.defaultLocale, 'en', 'English must remain the default marketing locale');
assert.equal(marketingSource.sourceDigest, crypto.createHash('sha256').update(read('index.html')).digest('hex'), 'Marketing source catalog is stale. Run: node scripts/marketing-localization.mjs sync');
assert.equal(new Set(marketingSource.entries.map((entry) => entry.id)).size, marketingSource.entries.length, 'Marketing source catalog has duplicate IDs');
const structuredData = JSON.parse(index.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
const structuredStrings = structuredData['@graph'].flatMap((entry) => [entry.description, ...(entry.featureList ?? [])]).filter(Boolean);
for (const source of structuredStrings) {
  assert.ok(marketingSource.entries.some((entry) => entry.source === source), `Marketing catalog is missing structured-data copy: ${source}`);
}

for (const locale of localeManifest.locales) {
  assert.match(locale.code, /^[a-z]{2}$/, `invalid locale code: ${locale.code}`);
  assert.ok(['draft', 'reviewed', 'published'].includes(locale.status), `${locale.code} has an invalid translation status`);
  if (locale.status !== 'draft') {
    assert.match(locale.reviewedBy ?? '', /\S/, `${locale.code} needs a reviewer before it can leave draft`);
    assert.match(locale.reviewedOn ?? '', /^\d{4}-\d{2}-\d{2}$/, `${locale.code} needs an ISO review date before it can leave draft`);
  }
  if (locale.nativeReviewRequired && locale.status !== 'draft') {
    assert.match(locale.reviewedBy ?? '', /\S/, `${locale.code} requires a recorded native reviewer`);
  }
  const targetCatalog = JSON.parse(fs.readFileSync(path.join(repositoryRoot, `locales/marketing/${locale.code}.json`), 'utf8'));
  assert.equal(targetCatalog.locale, locale.code, `${locale.code} catalog has the wrong locale`);
  assert.equal(targetCatalog.sourceDigest, marketingSource.sourceDigest, `${locale.code} catalog is stale`);
  for (const [id, target] of Object.entries(targetCatalog.translations)) {
    const source = marketingSource.entries.find((entry) => entry.id === id)?.source;
    assert.ok(source, `${locale.code} has a translation for an unknown unit: ${id}`);
    assert.equal(typeof target, 'string', `${locale.code}:${id} target must be text`);
    const tags = (value) => (value.match(/<\/?[a-z][^>]*>/gi) ?? []).sort();
    assert.deepEqual(tags(target), tags(source), `${locale.code}:${id} changes inline HTML`);
    for (const term of protectedTranslationTerms) {
      const occurrences = (value) => value.split(term).length - 1;
      assert.equal(occurrences(target), occurrences(source), `${locale.code}:${id} must preserve ${term} exactly`);
    }
  }
  const translationComplete = marketingSource.entries.every((entry) => targetCatalog.translations[entry.id]?.trim());
  assert.equal(targetCatalog.translationComplete, translationComplete, `${locale.code} has stale translation-completeness metadata`);
  if (['reviewed', 'published'].includes(locale.status)) {
    assert.ok(translationComplete, `${locale.code} cannot be ${locale.status} with untranslated units`);
  }

  const localePage = read(path.join('dist', locale.code, 'index.html'));
  assert.match(localePage, new RegExp(`data-target-locale=["']${locale.code}["']`), `${locale.code} draft is missing its locale marker`);
  assert.match(localePage, new RegExp(`data-translation-status=["']${locale.status}["']`), `${locale.code} page is missing its translation status`);
  if (translationComplete) {
    const localeStructuredData = JSON.parse(localePage.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
    assert.ok(localeStructuredData['@graph'].some((entry) => entry.inLanguage === locale.code), `${locale.code} structured data declares the wrong language`);
    assert.match(localePage, new RegExp(`<meta property=["']og:url["'] content=["']https://ioths\\.bedrockrebel\\.app/${locale.code}/["']`), `${locale.code} page has the wrong social URL`);
  }
  if (locale.status === 'published') {
    assert.match(localePage, new RegExp(`<html lang=["']${locale.code}["']`), `${locale.code} page must declare its translated language`);
    assert.doesNotMatch(localePage, /<meta[^>]+name=["']robots["'][^>]+noindex/i, `${locale.code} published page must be indexable`);
    assert.match(index, new RegExp(`hreflang=["']${locale.code}["'] href=["']https://ioths\\.bedrockrebel\\.app/${locale.code}/["']`), `English page is missing ${locale.code} hreflang`);
    assert.match(localePage, new RegExp(`hreflang=["']${locale.code}["'] href=["']https://ioths\\.bedrockrebel\\.app/${locale.code}/["']`), `${locale.code} page is missing its hreflang`);
    assert.match(read('dist/sitemap.xml'), new RegExp(`<loc>https://ioths\\.bedrockrebel\\.app/${locale.code}/</loc>`), `Sitemap is missing ${locale.code}`);
  } else {
    assert.match(localePage, new RegExp(`<html lang=["']${translationComplete ? locale.code : 'en'}["']`), `${locale.code} draft declares the wrong content language`);
    assert.match(localePage, /<meta[^>]+name=["']robots["'][^>]+noindex/i, `${locale.code} draft must remain noindex`);
  }
  assert.equal((localePage.match(/<meta[^>]+name=["']robots["']/gi) ?? []).length, 1, `${locale.code} page must have one robots directive`);
}

for (const page of htmlPages.filter((file) => file !== 'index.html' && !localeManifest.locales.some((locale) => file === `${locale.code}/index.html`))) {
  assert.match(read(path.join('dist', page)), /<meta[^>]+name=["']robots["'][^>]+noindex/i, `${page} must remain noindex`);
}

const headers = read('dist/_headers');
for (const requiredHeader of [
  'Content-Security-Policy:', "form-action 'self'", "frame-ancestors 'none'", "script-src 'self'", 'Referrer-Policy:',
  'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY',
  'https://ioths-contact.platoscave.workers.dev', 'https://challenges.cloudflare.com', 'https://nom.telemetrydeck.com',
]) {
  assert.match(headers, new RegExp(requiredHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `_headers is missing ${requiredHeader}`);
}

assert.match(read('dist/robots.txt'), /Sitemap:\s*https:\/\/ioths\.bedrockrebel\.app\/sitemap\.xml/);
for (const redirect of [
  '/privacy /legal/privacy 301',
  '/de/privacy /legal/de/privacy 301',
  '/terms.html /legal/terms 301',
  '/impressum.html /legal/impressum 301',
  '/contact.html /support 301',
  '/de/terms.html /legal/de/terms 301',
]) {
  assert.match(read('dist/_redirects'), new RegExp(`^${redirect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `missing redirect: ${redirect}`);
}

console.log(`static site checks passed (${htmlPages.length} HTML pages, ${expectedFiles.length} build files)`);
