import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, "dist")
const workerDir = join(dist, "server")
const source = await readFile(join(root, "src/financialIngestion.js"), "utf8")
const ingestionModule = source.replace(/\nexport\s*\{[\s\S]*?\}\s*$/m, "\n")
const page = await readFile(join(root, "index.html"), "utf8")
const projectId = JSON.parse(await readFile(join(root, ".openai/hosting.json"), "utf8")).project_id

const robotsTxt = `User-agent: *
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

const worker = `${ingestionModule}

const page = ${JSON.stringify(page)}
const robotsTxt = ${JSON.stringify(robotsTxt)}
const cache = new Map()
const AI_ENABLED = false

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })
}

async function ingest(ticker, env) {
  const cacheKey = ticker.toUpperCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.time < 15 * 60_000) return cached.value

  const providerWarnings = []
  const secUserAgent = env.SEC_USER_AGENT || "eval-system-2 financial normalization contact@example.com"
  const optionalTasks = [
    fetchSecBundle(cacheKey, secUserAgent).catch((error) => {
      providerWarnings.push("SEC unavailable: " + error.message)
      return null
    }),
    fetchYahooMarketSeries(cacheKey).catch((error) => {
      providerWarnings.push("Yahoo Finance unavailable: " + error.message)
      return null
    }),
    fetchNasdaqSupplement(cacheKey).catch((error) => {
      providerWarnings.push("Nasdaq unavailable: " + error.message)
      return null
    }),
    fetchAlphaVantageSupplement(cacheKey, env.ALPHA_VANTAGE_API_KEY).catch((error) => {
      providerWarnings.push("Alpha Vantage unavailable: " + error.message)
      return null
    }),
    fetchFmpSupplement(cacheKey, env.FMP_API_KEY).catch((error) => {
      providerWarnings.push("Financial Modeling Prep unavailable: " + error.message)
      return null
    }),
  ]
  const [bundle, yahoo, nasdaq, alpha, fmp] = await Promise.all(optionalTasks)
  const sec = bundle ? normalizeSecCompany(bundle) : emptyNormalizedCompany(cacheKey)
  const supplements = [nasdaq, alpha, fmp].filter(Boolean)
  if (!bundle && !supplements.some((item) => item.inputs?.revenue > 0)) {
    throw new Error("No financial-statement provider returned data for " + cacheKey + ".")
  }
  const marketSources = [yahoo, nasdaq?.marketSeries, alpha?.marketSeries, fmp?.marketSeries].filter(Boolean)
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
    ai: { enabled: AI_ENABLED, used: false },
  }
  cache.set(cacheKey, { time: Date.now(), value })
  return value
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === "/robots.txt") return new Response(robotsTxt, { headers: { "content-type": "text/plain; charset=utf-8" } })
    if (url.pathname === "/api/config") return json({ aiIngestionEnabled: AI_ENABLED })
    if (url.pathname === "/api/ingest") {
      const ticker = String(url.searchParams.get("ticker") || "").trim().toUpperCase()
      if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return json({ error: "Enter a valid public-company ticker." }, 400)
      try {
        return json(await ingest(ticker, env))
      } catch (error) {
        return json({ error: error.message }, 502)
      }
    }
    if (url.pathname === "/api/ai-ingest") return json({ error: "AI ingestion is disabled by default." }, 403)
    if (url.pathname !== "/") return new Response("Not found", { status: 404 })
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } })
  },
}
`

await mkdir(workerDir, { recursive: true })
await mkdir(join(dist, ".openai"), { recursive: true })
await copyFile(join(root, "index.html"), join(dist, "index.html"))
await writeFile(join(workerDir, "index.js"), worker)
await writeFile(join(dist, ".openai/hosting.json"), `${JSON.stringify({ project_id: projectId }, null, 2)}\n`)
