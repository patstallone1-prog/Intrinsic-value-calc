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

// The deployed worker is stateless (no filesystem/DB), so the screener's ongoing background
// run can't execute there. Instead, bake in the latest local snapshot at build time - each
// redeploy after a screener run ships an updated snapshot for the hosted /api/screener route.
async function readScreenerSnapshot() {
  try {
    const raw = await readFile(join(root, "data/screener-results.jsonl"), "utf8")
    const results = []
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        results.push(JSON.parse(line))
      } catch {
        // Skip a partially-written trailing line.
      }
    }
    return results
  } catch {
    return []
  }
}
async function readScreenerMetaSnapshot() {
  try {
    return JSON.parse(await readFile(join(root, "data/screener-meta.json"), "utf8"))
  } catch {
    return null
  }
}
const screenerResults = await readScreenerSnapshot()
const screenerMeta = await readScreenerMetaSnapshot()

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
const screenerResults = ${JSON.stringify(screenerResults)}
const screenerMeta = ${JSON.stringify(screenerMeta)}
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

  const value = await ingestTicker(cacheKey, {
    secUserAgent: env.SEC_USER_AGENT || "eval-system-2 financial normalization contact@example.com",
    alphaVantageApiKey: env.ALPHA_VANTAGE_API_KEY,
    fmpApiKey: env.FMP_API_KEY,
  })
  value.ai = { enabled: AI_ENABLED, used: false }
  cache.set(cacheKey, { time: Date.now(), value })
  return value
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === "/robots.txt") return new Response(robotsTxt, { headers: { "content-type": "text/plain; charset=utf-8" } })
    if (url.pathname === "/api/config") return json({ aiIngestionEnabled: AI_ENABLED })
    if (url.pathname === "/api/screener") return json({ results: screenerResults, meta: screenerMeta, overrides: {} })
    if (url.pathname === "/api/screener/overrides") return json({ error: "This deployment has no persistent storage; fill-ins are kept in your browser." }, 501)
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
// Static snapshot for hosts with no API: the page falls back to this when /api/screener 404s.
await writeFile(join(dist, "screener-results.json"), JSON.stringify(screenerResults))
await writeFile(join(root, "screener-results.json"), JSON.stringify(screenerResults))
await writeFile(join(workerDir, "index.js"), worker)
await writeFile(join(dist, ".openai/hosting.json"), `${JSON.stringify({ project_id: projectId }, null, 2)}\n`)
