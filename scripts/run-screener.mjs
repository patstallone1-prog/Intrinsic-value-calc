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
import { ENGINE_FINANCIAL_FIELDS, ingestTicker } from "../src/financialIngestion.js"
import { AUTOMATED_BASE_INPUTS, computeValuation, normalizeInputs } from "../src/valuationEngine.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataDir = path.join(root, "data")
const resultsPath = path.join(dataDir, "screener-results.jsonl")
const metaPath = path.join(dataDir, "screener-meta.json")
const errorsPath = path.join(dataDir, "screener-errors.log")

const SEC_UA = process.env.SEC_USER_AGENT || "eval-system-2 screener larry.albukerk@gmail.com"
const CONCURRENCY = Math.max(1, Number(process.env.SCREENER_CONCURRENCY || 3))
const DISPATCH_DELAY_MS = Math.max(0, Number(process.env.SCREENER_DELAY_MS ?? 250))
const FMP_MAX_CALLS_PER_RUN = Math.max(0, Number(process.env.FMP_MAX_CALLS_PER_RUN ?? 40))
// Alpha Vantage's free tier is a hard 25 requests/day and each ticker costs 2 (OVERVIEW +
// GLOBAL_QUOTE), so at most ~12 tickers/day can ever get real data from it. Budgeting to 10
// leaves a couple of calls of headroom for any interactive /api/ingest use on the same key.
const ALPHA_VANTAGE_MAX_CALLS_PER_RUN = Math.max(0, Number(process.env.ALPHA_VANTAGE_MAX_CALLS_PER_RUN ?? 10))
let fmpTicketsUsed = 0
let alphaVantageTicketsUsed = 0
let alphaVantageThrottled = false

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

// Issuers whose "company" is a fund, ETN/ETF sponsor, trust or SPAC shell have no operating
// business to value; they are excluded from the universe rather than priced as if they did.
const NON_OPERATING_TITLE = /\b(ETF|ETN|ETNs)\b|proshares|ishares|direxion|vaneck|wisdomtree|graniteshares|invesco .*trust|spdr|select sector|volatility|leveraged|acquisition corp|acquisition co\b|acquisition company|capital trust\b|royalty trust|income trust|municipal|tax-exempt|closed[- ]end|\bfund\b|\btrust\b.*\b(series|units|shares)\b/i

async function loadTickerUniverse() {
  if (TICKER_FILTER) return [...TICKER_FILTER].map((ticker) => ({ ticker, title: ticker, cik: "" }))
  const headers = { "User-Agent": SEC_UA, Accept: "application/json" }
  const [tickersRes, exchangeRes] = await Promise.all([
    fetch("https://www.sec.gov/files/company_tickers.json", { headers }),
    fetch("https://www.sec.gov/files/company_tickers_exchange.json", { headers }).catch(() => null),
  ])
  if (!tickersRes.ok) throw new Error(`SEC ticker list request failed: ${tickersRes.status}`)
  const raw = await tickersRes.json()
  const exchangeByTicker = new Map()
  if (exchangeRes?.ok) {
    const payload = await exchangeRes.json()
    const idx = Object.fromEntries((payload.fields || []).map((field, index) => [field, index]))
    for (const row of payload.data || []) exchangeByTicker.set(String(row[idx.ticker] || "").toUpperCase(), row[idx.exchange] || "")
  }
  // One operating company per CIK: the SEC list carries every listed instrument of an issuer
  // (preferreds, exchange-traded notes, foreign OTC lines of the same shares). Each would
  // otherwise be valued with the issuer's financials against the instrument's own price. Keep
  // the primary listing - the first entry on a major exchange, else the first entry.
  const exchangeRank = { NYSE: 0, Nasdaq: 0, CBOE: 2, OTC: 3 }
  const byCik = new Map()
  let order = 0
  for (const row of Object.values(raw)) {
    const ticker = String(row.ticker || "").toUpperCase()
    if (!ticker || !/^[A-Z]{1,6}(\.[A-Z])?$/.test(ticker)) continue
    if (NON_OPERATING_TITLE.test(row.title || "")) continue
    const cik = String(row.cik_str).padStart(10, "0")
    const exchange = exchangeByTicker.get(ticker) || ""
    const candidate = { ticker, title: row.title, cik, exchange, rank: exchangeRank[exchange] ?? 4, order: order++ }
    const current = byCik.get(cik)
    if (!current || candidate.rank < current.rank || (candidate.rank === current.rank && candidate.order < current.order)) byCik.set(cik, candidate)
  }
  return [...byCik.values()].sort((a, b) => a.order - b.order).map(({ ticker, title, cik }) => ({ ticker, title, cik }))
}

async function ingestAndValue(ticker) {
  const fmpBudgetRemaining = fmpTicketsUsed < FMP_MAX_CALLS_PER_RUN
  const alphaVantageBudgetRemaining = alphaVantageTicketsUsed < ALPHA_VANTAGE_MAX_CALLS_PER_RUN && !alphaVantageThrottled
  const ingestion = await ingestTicker(ticker, {
    secUserAgent: SEC_UA,
    alphaVantageApiKey: alphaVantageBudgetRemaining ? process.env.ALPHA_VANTAGE_API_KEY : undefined,
    fmpApiKey: fmpBudgetRemaining ? process.env.FMP_API_KEY : undefined,
  })
  if (ingestion.usedFmp) fmpTicketsUsed += 1
  if (ingestion.usedAlphaVantage) alphaVantageTicketsUsed += 1
  // Once the key reports its daily cap, stop spending two calls per ticker on it for the rest
  // of the run - the provider is simply unavailable until the quota resets.
  const throttleNote = (ingestion.warnings || []).find((note) => /Alpha Vantage unavailable/.test(note) && /rate limit|requests per day|premium/i.test(note))
  if (throttleNote && !alphaVantageThrottled) {
    alphaVantageThrottled = true
    console.log(`  Alpha Vantage daily quota reached after ${alphaVantageTicketsUsed} tickers; skipping it for the remainder of this run.`)
  }
  const inputs = normalizeInputs({ ...AUTOMATED_BASE_INPUTS, ...ingestion.inputs })
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
    applicableCount: normalized.coverage?.total || 0,
    providers,
    periodBasis: normalized.periodBasis || "annual",
    usedFmp: !!normalized.usedFmp,
    usedAlphaVantage: !!normalized.usedAlphaVantage,
    warningsCount: (result.warnings?.length || 0) + (normalized.warnings?.length || 0),
    errorsCount: result.errors?.length || 0,
    // The ingested engine inputs and the fields no provider could fill travel with the
    // record so the site can show a fill-in form per company and recompute the valuation
    // in the browser once a person supplies the rest.
    inputs: compactInputs(normalized.inputs),
    missing: normalized.missing || [],
    processedAt: new Date().toISOString(),
  }
}

const RECORD_INPUT_FIELDS = [
  ...ENGINE_FINANCIAL_FIELDS, "lifecycleStage", "profitabilityStatus", "capitalStatus",
  "asset1Type", "asset1Value", "asset2Type", "asset2Value",
]
function compactInputs(inputs) {
  const out = {}
  for (const key of RECORD_INPUT_FIELDS) {
    const value = inputs[key]
    if (value === undefined || value === null) continue
    if (typeof value === "number" && value === 0) continue
    out[key] = typeof value === "number" ? round(value, 6) : value
  }
  return out
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
        if (succeeded % 25 === 0) console.log(`  [${succeeded} ok / ${failed} failed / ${processedThisRun} attempted / FMP on ${fmpTicketsUsed}, Alpha Vantage on ${alphaVantageTicketsUsed}] latest: ${ticker}`)
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
      alphaVantageTicketsUsed,
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
    alphaVantageTicketsUsed,
    running: false,
  })
  console.log(`Screener run complete: ${succeeded} succeeded, ${failed} failed, ${Math.max(queue.length - processedThisRun, 0)} still pending. FMP used on ${fmpTicketsUsed}/${FMP_MAX_CALLS_PER_RUN} budgeted tickers, Alpha Vantage on ${alphaVantageTicketsUsed}/${ALPHA_VANTAGE_MAX_CALLS_PER_RUN}.`)
}

main().catch((error) => {
  console.error("Screener run crashed:", error)
  process.exit(1)
})
