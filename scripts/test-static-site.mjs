import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repositoryRoot, 'dist');

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
    if (/type=["']application\/ld\+json["']/i.test(match[1]) || !match[2].trim()) continue;
    assert.doesNotThrow(() => Function(match[2]), `${page} contains invalid inline JavaScript`);
  }
}

const index = read('dist/index.html');
assert.doesNotMatch(index, /<meta[^>]+name=["']robots["'][^>]+noindex/i, 'index.html must remain indexable');
assert.match(index, /rel=["']canonical["']/i, 'index.html needs a canonical URL');
assert.match(index, /application\/ld\+json/i, 'index.html needs JSON-LD');
assert.doesNotThrow(() => JSON.parse(index.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)[1]), 'JSON-LD must be valid JSON');

for (const page of htmlPages.filter((file) => file !== 'index.html')) {
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
  '/de/index.html /legal/de/privacy 301',
  '/de/terms.html /legal/de/terms 301',
]) {
  assert.match(read('dist/_redirects'), new RegExp(`^${redirect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `missing redirect: ${redirect}`);
}

console.log(`static site checks passed (${htmlPages.length} HTML pages, ${expectedFiles.length} build files)`);
