import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

function read(path) { return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'); }
execFileSync(process.execPath, ['--check', new URL('../server/ebay/index.js', import.meta.url).pathname], { stdio: 'pipe' });
const backend = read('server/ebay/index.js');
assert.match(backend, /X-EBAY-C-ENDUSERCTX/);
assert.match(backend, /itemAffiliateWebUrl/);
assert.match(backend, /affiliateCampaignId/);
console.log('Backend syntax and ePN source checks OK');
const jsPaths = ['build/builder.js', 'discover/ps5/comparison.js', 'discover/pokemon/showcase.js', 'marketplace.js', 'app.js'];
for (const path of jsPaths) { new vm.Script(read(path), { filename: path }); console.log('JS syntax OK:', path); }
// Fail CI if admin-only tooling becomes part of the public site again.
assert.equal(fs.existsSync(new URL('../campaign-studio/index.html', import.meta.url)), false, 'Campaign admin must not be publicly served');
assert.equal(fs.existsSync(new URL('../campaign-studio/studio.js', import.meta.url)), false, 'Campaign admin JS must not be public');
assert.equal(fs.existsSync(new URL('../campaign-studio/studio.css', import.meta.url)), false, 'Campaign admin CSS must not be public');
const publicPages = ['index.html', 'build/index.html', 'build/builder.js'];
for (const path of publicPages) {
  const source = read(path);
  assert.doesNotMatch(source, /campaign-studio\//i, 'No public admin links: ' + path);
  assert.doesNotMatch(source, /\bVPSBridge\b|\bVPS\b/i, 'No internal infrastructure names in public UX: ' + path);
}
const home = read('index.html');
const builder = read('build/index.html');
const ps5 = read('discover/ps5/index.html');
const pokemon = read('discover/pokemon/index.html');
const sitemap = read('sitemap.xml');
assert.match(home, /id="uh-guides"/);
assert.match(home, /href="build\/"/);
for(const slug of ['ps5','pokemon','refurbished-iphone']) {
  assert.ok(home.includes('discover/' + slug + '/'), 'Homepage links '+slug);
  assert.ok(sitemap.includes('/discover/' + slug + '/'), 'Sitemap '+slug);
  const content=read('discover/' + slug + '/index.html');
  assert.match(content, /application\/ld\+json/);
  assert.match(content, /rel="canonical"/);
  assert.match(content, /eBay Partner/);
}
assert.match(sitemap, /\/build\//);
assert.match(builder, /builder\.js/);
assert.match(builder, /builder\.css/);
assert.match(builder, /data-kit="pokemon-live"/);
assert.match(builder, /data-kit="pokemon-reveal"/);
assert.match(ps5, /ps5-listing-comparison/);
assert.match(ps5, /comparison\.js/);
assert.match(ps5, /\?kit=ps5-creator/);
assert.match(pokemon, /\?kit=pokemon-live/);
assert.match(pokemon, /\?kit=pokemon-inventory/);
assert.match(pokemon, /\?kit=pokemon-reveal/);
assert.match(pokemon, /id="uh-featured-grid"/);
assert.match(pokemon, /id="uh-fresh-grid"/);
assert.match(pokemon, /showcase\.css/);
assert.match(pokemon, /showcase\.js/);
const placementConfig = JSON.parse(read('discover/pokemon/featured-placements.json'));
assert.equal(placementConfig.schemaVersion, 1);
assert.deepEqual(placementConfig.placements, [], 'No sponsorship may be fabricated');
const shelf = read('discover/pokemon/showcase.js');
assert.match(shelf, /activePlacements/);
assert.match(shelf, /placement\.approved === true|p\.approved === true/);
assert.match(shelf, /sellerUsername/);
assert.match(shelf, /verified production marketplace inventory is unavailable/i);
assert.match(shelf, /slice\(0,9\)/);
assert.match(shelf, /picks\.length === 3/);
assert.match(shelf, /Promotional partner/);
assert.match(shelf, /Sponsored/);
assert.match(shelf, /featured affiliate pick/i);
assert.match(read('market-item.js'), /rel="sponsored noopener noreferrer"/);
const cmp=read('discover/ps5/comparison.js');
assert.match(cmp, /status\.environment/);
assert.match(cmp, /tokenValid/);
assert.match(cmp, /No sample prices were substituted/);
const gen=read('build/builder.js');
assert.match(gen, /executionAuthorized:false/);
assert.match(gen, /serviceConnected:false/);
assert.match(gen, /No payments, stakes/);
console.log('UH discovery static checks passed');
