import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 4317);
const GATEWAY = process.env.UH_EBAY_GATEWAY || `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = process.env.UH_INTELLIGENCE_DIR || path.resolve('..', 'data', 'ebay');
const RAW_QUERIES = process.env.UH_DISCOVERY_QUERIES || 'sneakers,headphones,smartwatch,gaming,handbag';
const QUERIES = RAW_QUERIES.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 20);
const LIMIT = Math.min(25, Math.max(1, Number(process.env.UH_DISCOVERY_LIMIT || 10)));

function scoreEntry(entry) {
  const appearances = entry.queries.size;
  const bestRank = Math.min(...entry.ranks);
  const averageRank = entry.ranks.reduce((a, b) => a + b, 0) / entry.ranks.length;
  const feedback = Number(entry.item.seller?.feedbackPercentage || 0);

  // V0.1 discovery score: repeat appearances + search position + seller signal.
  // This is NOT an eBay sales-volume or best-seller metric.
  const repetitionScore = Math.min(35, appearances * 12);
  const rankScore = Math.max(0, 45 - (averageRank - 1) * 4);
  const sellerScore = feedback > 0 ? Math.min(20, feedback / 5) : 0;
  return Math.round((repetitionScore + rankScore + sellerScore) * 10) / 10;
}

async function fetchQuery(q) {
  const url = new URL('/api/commerce/ebay/search', GATEWAY);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(LIMIT));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `gateway search failed (${response.status})`);
  return payload;
}

async function main() {
  const startedAt = new Date().toISOString();
  const aggregate = new Map();
  const queryResults = [];

  for (const q of QUERIES) {
    try {
      const payload = await fetchQuery(q);
      queryResults.push({ query: q, ok: true, count: payload.count || 0, total: payload.total || 0 });
      (payload.items || []).forEach((item, index) => {
        if (!item?.id) return;
        const existing = aggregate.get(item.id) || {
          item,
          queries: new Set(),
          ranks: []
        };
        existing.queries.add(q);
        existing.ranks.push(index + 1);
        aggregate.set(item.id, existing);
      });
    } catch (error) {
      queryResults.push({ query: q, ok: false, error: error.message });
    }
  }

  const items = [...aggregate.values()]
    .map((entry) => ({
      ...entry.item,
      intelligence: {
        discoveryScore: scoreEntry(entry),
        queryAppearances: entry.queries.size,
        matchedQueries: [...entry.queries],
        bestRank: Math.min(...entry.ranks),
        averageRank: Math.round((entry.ranks.reduce((a, b) => a + b, 0) / entry.ranks.length) * 100) / 100
      }
    }))
    .sort((a, b) => b.intelligence.discoveryScore - a.intelligence.discoveryScore);

  const snapshot = {
    schemaVersion: '0.1.0',
    generatedAt: new Date().toISOString(),
    startedAt,
    source: 'ebay',
    environment: process.env.EBAY_ENV || 'sandbox',
    marketplace: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
    metricNotice: 'Discovery score is an UltraHype ranking heuristic based on query overlap, Browse search position, and available seller feedback. It is not an eBay sales-volume or best-seller metric.',
    queryCount: QUERIES.length,
    itemCount: items.length,
    queries: queryResults,
    items
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const snapshotPath = path.join(OUTPUT_DIR, 'discovery-snapshot.json');
  const historyName = `discovery-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, historyName), JSON.stringify(snapshot, null, 2), 'utf8');

  // Keep the history bounded to the most recent 168 snapshots (roughly a week at hourly cadence).
  const names = (await fs.readdir(OUTPUT_DIR))
    .filter((name) => /^discovery-\d{4}-/.test(name))
    .sort()
    .reverse();
  await Promise.all(names.slice(168).map((name) => fs.unlink(path.join(OUTPUT_DIR, name)).catch(() => {})));

  console.log(JSON.stringify({ ok: true, output: snapshotPath, itemCount: items.length, queryCount: QUERIES.length }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
