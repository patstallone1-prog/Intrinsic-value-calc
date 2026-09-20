// Background screener: runs every SEC-registered public company ticker through the same
// ingestion + valuation pipeline as the live app, and records the result so the whole
// universe can be browsed in a sortable/searchable table.
//
// Resumable: results are appended one JSON line per ticker to data/screener-results.jsonl,
// and on restart tickers already present there are skipped (pass --refresh to redo them).
// Safe to run for hours unattended - a failure on one ticker is logged and the run moves on.
//
// Usage:
//   node scripts/run-screener.mjs                # process the full SEC ticker universe
//   node scripts/run-screener.mjs --limit 200     # stop after 200 newly processed tickers
//   node scripts/run-screener.mjs --refresh       # ignore prior results, reprocess everything
//   node scripts/run-screener.mjs --tickers AAPL,MSFT,DAL   # process just these tickers
//
// Optional env: ALPHA_VANTAGE_API_KEY, FMP_API_KEY (used as supplement providers, same as
// the live server), SEC_USER_AGENT (a real contact email, required by SEC's fair-use policy).
//
// FMP is on a plan with a hard daily call cap and each ticker's FMP supplement costs 5 calls
// (profile, income, balance, cash flow, key metrics), so this run enforces its own budget via
// FMP_MAX_CALLS_PER_RUN (default 40 tickers worth, ~200 calls, leaving headroom under 250) and
// stops handing the FMP key to new tickers once it's spent - later tickers just proceed without
// it, the same as if the key were never configured.
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ingestTicker } from "../src/financialIngestion.js"
import { DEFAULT_INPUTS, computeValuation, normalizeInputs } from "../src/valuationEngine.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataDir = path.join(root, "data")
const resultsPath = path.join(dataDir, "screener-results.jsonl")
const metaPath = path.join(dataDir, "screener-meta.json")
const errorsPath = path.join(dataDir, "screener-errors.log")

const SEC_UA = process.env.SEC_USER_AGENT || "eval-system-2 screener larry.albukerk@gmail.com"
const CONCURRENCY = Math.max(1, Number(process.env.SCREENER_CONCURRENCY || 3))
const DISPATCH_DELAY_MS = Math.max(0, Number(process.env.SCREENER_DELAY_MS ?? 250))
const FMP_MAX_CALLS_PER_RUN = Math.max(0, Number(process.env.FMP_MAX_CALLS_PER_RUN ?? 40))
let fmpTicketsUsed = 0

function flagValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}
const REFRESH = process.argv.includes("--refresh")
const LIMIT = flagValue("--limit") ? Number(flagValue("--limit")) : Infinity
const TICKER_FILTER = flagValue("--tickers")
  ? new Set(flagValue("--tickers").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean))
  : null

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadProcessedTickers() {
  if (REFRESH) return new Set()
  try {
    const raw = await fs.readFile(resultsPath, "utf8")
    const set = new Set()
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        if (record.ticker) set.add(record.ticker)
      } catch {
        // Ignore a partially-written trailing line from a prior crash; it will be redone.
      }
    }
    return set
  } catch {
    return new Set()
  }
}

async function loadTickerUniverse() {
  if (TICKER_FILTER) return [...TICKER_FILTER].map((ticker) => ({ ticker, title: ticker, cik: "" }))
  const response = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  })
  if (!response.ok) throw new Error(`SEC ticker list request failed: ${response.status}`)
  const raw = await response.json()
  const seen = new Set()
  const rows = []
  for (const row of Object.values(raw)) {
    const ticker = String(row.ticker || "").toUpperCase()
    if (!ticker || seen.has(ticker) || !/^[A-Z]{1,6}(\.[A-Z])?$/.test(ticker)) continue
    seen.add(ticker)
    rows.push({ ticker, title: row.title, cik: String(row.cik_str).padStart(10, "0") })
  }
  return rows
}

async function ingestAndValue(ticker) {
  const fmpBudgetRemaining = fmpTicketsUsed < FMP_MAX_CALLS_PER_RUN
  const ingestion = await ingestTicker(ticker, {
    secUserAgent: SEC_UA,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
    fmpApiKey: fmpBudgetRemaining ? process.env.FMP_API_KEY : undefined,
  })
  if (ingestion.usedFmp) fmpTicketsUsed += 1
  const inputs = normalizeInputs({ ...DEFAULT_INPUTS, ...ingestion.inputs })
  const result = computeValuation(inputs)
  return { normalized: ingestion, marketSnapshot: ingestion.marketSnapshot, result, providers: ingestion.providers }
}

function buildRecord(ticker, title, cik, outcome) {
  const { normalized, marketSnapshot, result, providers } = outcome
  const observedMarketCap = result.marketComparison?.observedMarketCap || marketSnapshot.currentMarketCap || 0
  const fairCommonEquity = result.outputs.fairCommonEquity
  const premiumDiscount = result.marketComparison
    ? result.marketComparison.premiumDiscount
    : observedMarketCap > 0
      ? round((fairCommonEquity - observedMarketCap) / observedMarketCap)
      : null
  return {
    ticker,
    cik,
    companyName: result.input.companyName || title,
    sector: result.input.sector,
    businessModel: result.input.businessModel,
    currentPrice: round(marketSnapshot.currentPrice || 0, 2),
    sharesOutstanding: round(result.input.sharesOutstanding || 0, 0),
    observedMarketCap: round(observedMarketCap, 2),
    fairCommonEquity: round(fairCommonEquity, 2),
    impliedVsMarketPct: premiumDiscount === null ? null : round(premiumDiscount * 100, 2),
    fairValueLow: round(result.bands.final.low, 2),
    fairValueHigh: round(result.bands.final.high, 2),
    inFairValueRange: result.marketComparison?.inFairValueRange ?? null,
    confidence: round(result.bands.quality, 3),
    coveragePct: round((normalized.coverage?.percent || 0) * 100, 1),
    providers,
    usedFmp: !!normalized.usedFmp,
    warningsCount: (result.warnings?.length || 0) + (normalized.warnings?.length || 0),
    errorsCount: result.errors?.length || 0,
    processedAt: new Date().toISOString(),
  }
}

async function appendLine(filePath, line) {
  await fs.appendFile(filePath, `${line}\n`, "utf8")
}

async function writeMeta(meta) {
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8")
}

async function main() {
  await fs.mkdir(dataDir, { recursive: true })
  if (REFRESH) {
    // Results are append-only during a run (safe for concurrent workers and crash recovery),
    // so a --refresh has to start from an empty file itself - otherwise every reprocessed
    // ticker would be appended alongside its stale prior entry instead of replacing it.
    await fs.writeFile(resultsPath, "", "utf8").catch(() => {})
    await fs.writeFile(errorsPath, "", "utf8").catch(() => {})
  }
  const [universe, alreadyProcessed] = await Promise.all([loadTickerUniverse(), loadProcessedTickers()])
  const queue = universe.filter((row) => !alreadyProcessed.has(row.ticker))
  console.log(`Screener universe: ${universe.length} tickers, ${alreadyProcessed.size} already recorded, ${queue.length} pending (limit ${LIMIT === Infinity ? "none" : LIMIT}).`)

  let processedThisRun = 0
  let succeeded = 0
  let failed = 0
  let cursor = 0
  const startedAt = new Date().toISOString()

  async function worker() {
    while (cursor < queue.length && processedThisRun < LIMIT) {
      const index = cursor
      cursor += 1
      const { ticker, title, cik } = queue[index]
      processedThisRun += 1
      try {
        const outcome = await ingestAndValue(ticker)
        const record = buildRecord(ticker, title, cik, outcome)
        await appendLine(resultsPath, JSON.stringify(record))
        succeeded += 1
        if (succeeded % 25 === 0) console.log(`  [${succeeded} ok / ${failed} failed / ${processedThisRun} attempted / FMP used on ${fmpTicketsUsed} tickers] latest: ${ticker}`)
      } catch (error) {
        failed += 1
        await appendLine(errorsPath, `${new Date().toISOString()} ${ticker} ${error.message}`)
      }
      if (DISPATCH_DELAY_MS > 0) await sleep(DISPATCH_DELAY_MS)
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker())
  const metaInterval = setInterval(() => {
    writeMeta({
      startedAt,
      updatedAt: new Date().toISOString(),
      universeSize: universe.length,
      totalRecorded: alreadyProcessed.size + succeeded,
      processedThisRun,
      succeededThisRun: succeeded,
      failedThisRun: failed,
      remaining: Math.max(queue.length - processedThisRun, 0),
      fmpTicketsUsed,
      running: true,
    }).catch(() => {})
  }, 5000)

  await Promise.all(workers)
  clearInterval(metaInterval)
  await writeMeta({
    startedAt,
    updatedAt: new Date().toISOString(),
    universeSize: universe.length,
    totalRecorded: alreadyProcessed.size + succeeded,
    processedThisRun,
    succeededThisRun: succeeded,
    failedThisRun: failed,
    remaining: Math.max(queue.length - processedThisRun, 0),
    fmpTicketsUsed,
    running: false,
  })
  console.log(`Screener run complete: ${succeeded} succeeded, ${failed} failed, ${Math.max(queue.length - processedThisRun, 0)} still pending. FMP used on ${fmpTicketsUsed}/${FMP_MAX_CALLS_PER_RUN} budgeted tickers.`)
}

main().catch((error) => {
  console.error("Screener run crashed:", error)
  process.exit(1)
})
