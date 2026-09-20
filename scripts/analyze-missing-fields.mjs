// One-off analysis: re-runs ingestion (no valuation) for a sample of already-processed
// tickers to capture which specific engine input fields come back "missing" most often,
// so we can see whether the same metric is failing to resolve across many companies rather
// than failures being scattered randomly. Not part of the regular screener pipeline.
//
// Usage: node scripts/analyze-missing-fields.mjs [sampleSize]
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  emptyNormalizedCompany,
  fetchAlphaVantageSupplement,
  fetchFmpSupplement,
  fetchNasdaqSupplement,
  fetchSecBundle,
  fetchYahooMarketSeries,
  finalizeNormalizedInputs,
  normalizeMarketSeries,
  normalizeSecCompany,
} from "../src/financialIngestion.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const resultsPath = path.join(root, "data/screener-results.jsonl")
const outPath = path.join(root, "data/missing-field-analysis.json")
const SEC_UA = process.env.SEC_USER_AGENT || "eval-system-2 analysis larry.albukerk@gmail.com"
const SAMPLE_SIZE = Number(process.argv[2] || 400)
const CONCURRENCY = 4

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ingest(ticker) {
  const [bundle, yahoo, nasdaq, alpha, fmp] = await Promise.all([
    fetchSecBundle(ticker, SEC_UA).catch(() => null),
    fetchYahooMarketSeries(ticker).catch(() => null),
    fetchNasdaqSupplement(ticker).catch(() => null),
    fetchAlphaVantageSupplement(ticker, process.env.ALPHA_VANTAGE_API_KEY).catch(() => null),
    fetchFmpSupplement(ticker, process.env.FMP_API_KEY).catch(() => null),
  ])
  const sec = bundle ? normalizeSecCompany(bundle) : emptyNormalizedCompany(ticker)
  const supplements = [nasdaq, alpha, fmp].filter(Boolean)
  const marketSources = [yahoo, nasdaq?.marketSeries, alpha?.marketSeries, fmp?.marketSeries].filter(Boolean)
  const shares = sec.inputs.sharesOutstanding || supplements.find((item) => item.inputs?.sharesOutstanding)?.inputs.sharesOutstanding || 0
  const marketSnapshot = normalizeMarketSeries(marketSources, shares)
  return finalizeNormalizedInputs(sec, marketSnapshot, supplements)
}

async function main() {
  const raw = await fs.readFile(resultsPath, "utf8")
  const rows = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line))
  // Sample skewed toward lower-coverage companies (where "missing" is most informative)
  // but includes a slice of high-coverage ones too, for contrast.
  const sortedByCoverage = [...rows].sort((a, b) => (a.coveragePct || 0) - (b.coveragePct || 0))
  const lowHalf = sortedByCoverage.slice(0, Math.floor(SAMPLE_SIZE * 0.7))
  const rest = sortedByCoverage.slice(Math.floor(SAMPLE_SIZE * 0.7))
  const highSample = []
  for (let i = 0; i < Math.min(Math.ceil(SAMPLE_SIZE * 0.3), rest.length); i++) {
    highSample.push(rest[Math.floor((i / (SAMPLE_SIZE * 0.3)) * rest.length)])
  }
  const sample = [...lowHalf, ...highSample]
  console.log(`Sampling ${sample.length} tickers for missing-field analysis...`)

  const missingCounts = new Map()
  const sectorMissingCounts = new Map()
  let cursor = 0
  let done = 0

  async function worker() {
    while (cursor < sample.length) {
      const row = sample[cursor]
      cursor += 1
      try {
        const normalized = await ingest(row.ticker)
        for (const field of normalized.missing) {
          missingCounts.set(field, (missingCounts.get(field) || 0) + 1)
          const key = `${row.sector}::${field}`
          sectorMissingCounts.set(key, (sectorMissingCounts.get(key) || 0) + 1)
        }
      } catch {
        // Ignore - this is a best-effort statistical pass, not the canonical record.
      }
      done += 1
      if (done % 50 === 0) console.log(`  ${done}/${sample.length}`)
      await sleep(200)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  const overallRanked = [...missingCounts.entries()].sort((a, b) => b[1] - a[1])
  const bySector = {}
  for (const [key, count] of sectorMissingCounts.entries()) {
    const [sector, field] = key.split("::")
    bySector[sector] = bySector[sector] || {}
    bySector[sector][field] = count
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sampleSize: sample.length,
    overallMissingFieldCounts: Object.fromEntries(overallRanked),
    bySector,
  }
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8")
  console.log("Top missing fields across sample:")
  for (const [field, count] of overallRanked.slice(0, 20)) {
    console.log(`  ${field}: ${count}/${sample.length} (${Math.round((count / sample.length) * 100)}%)`)
  }
  console.log(`Full breakdown written to ${outPath}`)
}

main().catch((error) => {
  console.error("Missing-field analysis crashed:", error)
  process.exit(1)
})
