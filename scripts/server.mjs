import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ingestTicker } from "../src/financialIngestion.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const port = Number(process.env.PORT || 4174)
const secUserAgent = process.env.SEC_USER_AGENT || "eval-system-2 financial normalization contact@example.com"
const aiEnabled = process.env.ENABLE_AI_INGESTION === "1"
const cache = new Map()
const screenerResultsPath = path.join(root, "data/screener-results.jsonl")
const screenerMetaPath = path.join(root, "data/screener-meta.json")

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

async function readScreenerResults() {
  try {
    const raw = await fs.readFile(screenerResultsPath, "utf8")
    const results = []
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        results.push(JSON.parse(line))
      } catch {
        // Skip a partially-written trailing line left by an in-progress run.
      }
    }
    return results
  } catch {
    return []
  }
}

async function readScreenerMeta() {
  try {
    return JSON.parse(await fs.readFile(screenerMetaPath, "utf8"))
  } catch {
    return null
  }
}

const screenerOverridesPath = path.join(root, "data/screener-overrides.json")
const sectorRatiosPath = path.join(root, "data/sector-ratios.json")

async function readSectorRatios() {
  try {
    return JSON.parse(await fs.readFile(sectorRatiosPath, "utf8")).groups || null
  } catch {
    return null
  }
}

async function readScreenerOverrides() {
  try {
    return JSON.parse(await fs.readFile(screenerOverridesPath, "utf8"))
  } catch {
    return {}
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => {
      chunks.push(chunk)
      if (chunks.reduce((sum, item) => sum + item.length, 0) > 256_000) reject(new Error("Request body too large"))
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

// Manual fill-ins submitted from the screener page. Kept as a plain per-ticker map so the
// page can merge them over the recorded inputs and recompute; the screener itself never
// overwrites them (a fresh provider value simply becomes the base the override sits on).
async function saveScreenerOverride(ticker, inputs) {
  const overrides = await readScreenerOverrides()
  const clean = {}
  for (const [key, value] of Object.entries(inputs || {})) {
    if (!/^[A-Za-z0-9]{1,40}$/.test(key)) continue
    if (typeof value === "number" && Number.isFinite(value)) clean[key] = value
    else if (typeof value === "string" && value.length <= 200) clean[key] = value
  }
  overrides[ticker] = { ...(overrides[ticker] || {}), ...clean, submittedAt: new Date().toISOString() }
  await fs.mkdir(path.dirname(screenerOverridesPath), { recursive: true })
  await fs.writeFile(screenerOverridesPath, `${JSON.stringify(overrides, null, 2)}\n`, "utf8")
  return overrides[ticker]
}

async function ingest(ticker) {
  const cacheKey = ticker.toUpperCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.time < 15 * 60_000) return cached.value

  const value = await ingestTicker(cacheKey, {
    secUserAgent,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
    fmpApiKey: process.env.FMP_API_KEY,
    sectorRatios: await readSectorRatios(),
  })
  value.ai = { enabled: aiEnabled, used: false }
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

const ROBOTS_TXT = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

User-agent: Google-Extended
Allow: /
`

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`)
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
    return res.end(ROBOTS_TXT)
  }
  if (url.pathname === "/api/config") return json(res, 200, { aiIngestionEnabled: aiEnabled })
  if (url.pathname === "/failed-companies.json") return serveFile(res, path.join(root, "data/failed-companies.json"))
  if (url.pathname === "/screener/" || url.pathname === "/screener") return serveFile(res, path.join(root, "dist/screener/index.html"))
  if (url.pathname === "/screener-results.json") return serveFile(res, path.join(root, "dist/screener-results.json"))
  if (url.pathname === "/api/screener") {
    const [results, meta, overrides] = await Promise.all([readScreenerResults(), readScreenerMeta(), readScreenerOverrides()])
    return json(res, 200, { results, meta, overrides })
  }
  if (url.pathname === "/api/screener/overrides") {
    if (req.method !== "POST") return json(res, 405, { error: "POST a JSON body of { ticker, inputs }." })
    try {
      const body = JSON.parse((await readBody(req)) || "{}")
      const ticker = String(body.ticker || "").trim().toUpperCase()
      if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return json(res, 400, { error: "Enter a valid ticker." })
      return json(res, 200, { ticker, override: await saveScreenerOverride(ticker, body.inputs) })
    } catch (error) {
      return json(res, 400, { error: error.message })
    }
  }
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
