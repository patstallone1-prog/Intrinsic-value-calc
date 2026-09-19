import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  fetchAlphaVantageSupplement,
  emptyNormalizedCompany,
  fetchFmpSupplement,
  fetchSecBundle,
  fetchYahooMarketSeries,
  finalizeNormalizedInputs,
  normalizeMarketSeries,
  normalizeSecCompany,
} from "../src/financialIngestion.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const port = Number(process.env.PORT || 4174)
const secUserAgent = process.env.SEC_USER_AGENT || "eval-system-2 financial normalization contact@example.com"
const aiEnabled = process.env.ENABLE_AI_INGESTION === "1"
const cache = new Map()

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

async function ingest(ticker) {
  const cacheKey = ticker.toUpperCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.time < 15 * 60_000) return cached.value

  const providerWarnings = []
  const optionalTasks = [
    fetchSecBundle(cacheKey, secUserAgent).catch((error) => {
      providerWarnings.push(`SEC unavailable: ${error.message}`)
      return null
    }),
    fetchYahooMarketSeries(cacheKey).catch((error) => {
      providerWarnings.push(`Yahoo Finance unavailable: ${error.message}`)
      return null
    }),
    fetchAlphaVantageSupplement(cacheKey, process.env.ALPHA_VANTAGE_API_KEY).catch((error) => {
      providerWarnings.push(`Alpha Vantage unavailable: ${error.message}`)
      return null
    }),
    fetchFmpSupplement(cacheKey, process.env.FMP_API_KEY).catch((error) => {
      providerWarnings.push(`Financial Modeling Prep unavailable: ${error.message}`)
      return null
    }),
  ]
  const [bundle, yahoo, alpha, fmp] = await Promise.all(optionalTasks)
  const sec = bundle ? normalizeSecCompany(bundle) : emptyNormalizedCompany(cacheKey)
  const supplements = [alpha, fmp].filter(Boolean)
  if (!bundle && !supplements.some((item) => item.inputs?.revenue > 0)) {
    throw new Error(`No financial-statement provider returned data for ${cacheKey}. Configure ALPHA_VANTAGE_API_KEY or FMP_API_KEY for non-SEC issuers.`)
  }
  const marketSources = [yahoo, alpha?.marketSeries, fmp?.marketSeries].filter(Boolean)
  const shares = sec.inputs.sharesOutstanding || supplements.find((item) => item.inputs?.sharesOutstanding)?.inputs.sharesOutstanding || 0
  const marketSnapshot = normalizeMarketSeries(marketSources, shares)
  const normalized = finalizeNormalizedInputs(sec, marketSnapshot, supplements)
  normalized.warnings.push(...providerWarnings)

  const value = {
    ticker: cacheKey,
    company: bundle?.company || { ticker: cacheKey, title: normalized.inputs.companyName },
    periodEnd: sec.periodEnd,
    marketSnapshot,
    providers: [bundle ? "SEC" : null, ...marketSources.map((item) => item.provider), ...supplements.map((item) => item.provider)].filter((item, index, all) => item && all.indexOf(item) === index),
    ...normalized,
    ai: { enabled: aiEnabled, used: false },
  }
  cache.set(cacheKey, { time: Date.now(), value })
  return value
}

async function serveFile(res, filePath) {
  const extension = path.extname(filePath)
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }
  try {
    const body = await fs.readFile(filePath)
    res.writeHead(200, { "content-type": `${types[extension] || "application/octet-stream"}; charset=utf-8` })
    res.end(body)
  } catch {
    json(res, 404, { error: "Not found" })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`)
  if (url.pathname === "/api/config") return json(res, 200, { aiIngestionEnabled: aiEnabled })
  if (url.pathname === "/api/ingest") {
    const ticker = String(url.searchParams.get("ticker") || "").trim().toUpperCase()
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return json(res, 400, { error: "Enter a valid public-company ticker." })
    try {
      return json(res, 200, await ingest(ticker))
    } catch (error) {
      return json(res, 502, { error: error.message })
    }
  }
  if (url.pathname === "/api/ai-ingest") {
    if (!aiEnabled) return json(res, 403, { error: "AI ingestion is disabled. Set ENABLE_AI_INGESTION=1 to enable it explicitly." })
    return json(res, 501, { error: "AI fallback is enabled but must be run through the audited Anthropic CLI path." })
  }
  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "")
  const resolved = path.resolve(root, requested)
  if (!resolved.startsWith(root)) return json(res, 403, { error: "Forbidden" })
  return serveFile(res, resolved)
})

server.listen(port, "127.0.0.1", () => {
  console.log(`Eval System 2 running at http://127.0.0.1:${port}`)
  console.log(`AI ingestion: ${aiEnabled ? "enabled" : "disabled (default)"}`)
})
