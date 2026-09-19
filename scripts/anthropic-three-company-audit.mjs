// Uses Anthropic to create Eval System 2 inputs for three new public companies,
// runs them through the local valuation engine, and audits the AI output for
// missing sources, default placeholders, shortcuts, and unsupported estimates.
//
// Usage:
//   ANTHROPIC_API_KEY=... node scripts/anthropic-three-company-audit.mjs TGT DAL AVGO
//   node scripts/anthropic-three-company-audit.mjs --dry-run TGT DAL AVGO
//
// Model is configurable via ANTHROPIC_MODEL. Claude 3.5 Sonnet is retired on
// the first-party API, so the default is the current Sonnet line. Set
// ANTHROPIC_MODEL=claude-opus-5 for a slower, deeper audit pass.
import fs from "node:fs/promises"
import { computeValuation, DEFAULT_INPUTS, normalizeInputs } from "../src/valuationEngine.js"

const DEFAULT_TICKERS = ["TGT", "DAL", "AVGO"]
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5"
const API_KEY = process.env.ANTHROPIC_API_KEY
const AI_INGESTION_ENABLED = process.env.ENABLE_AI_INGESTION === "1"
const ENABLE_WEB_SEARCH = process.env.ANTHROPIC_WEB_SEARCH !== "0"
const WEB_SEARCH_MAX_USES = Math.max(1, Number(process.env.ANTHROPIC_WEB_SEARCH_MAX_USES || 20))
const DRY_RUN = process.argv.includes("--dry-run")
const args = process.argv.slice(2).filter((arg) => arg !== "--dry-run")
const tickers = (args.length ? args : DEFAULT_TICKERS).slice(0, 3).map((ticker) => ticker.toUpperCase())
// SEC requires a real contact in the User-Agent or it throttles/blocks the request.
const SEC_UA = process.env.SEC_USER_AGENT || "eval-system-2 valuation automation larry.albukerk@gmail.com"

const MONEY_FIELDS = new Set([
  "revenue", "cash", "debt", "inventory", "ar", "ap", "pipelineValue", "backlogValue",
  "tangibleBookValue", "assetBackingValue", "marketCapOverride", "asset1Value", "asset2Value",
  "asset3Value", "asset4Value", "asset5Value", "asset6Value", "tam", "sam",
])

const CORE_NUMERIC_FIELDS = [
  "revenue", "revenueGrowth", "sectorCagr", "grossMargin", "opexRatio", "cash", "debt",
  "capexPct", "competitorCount", "competitorEvRevenue", "competitorEvEbitda",
  "competitorEvFcf", "competitorPe", "competitorRevenueGrowth", "competitorGrossMargin",
  "competitorEbitdaMargin", "competitorNetMargin", "competitorNetDebtRevenue", "tam", "sam",
]

const SUBJECTIVE_FIELDS = [
  "targetMarketRecognitionPct", "customerTrustScore", "purchaseFrequency", "missionCriticality",
  "consumerHabitStrength", "institutionalReliance", "competitionIntensity", "managementScore",
  "moatScore", "gtmScore", "switchingCostScore", "dataAdvantageScore", "networkEffectScore", "ipScore",
]

const FLAG_WORDS = /\b(guess|guessed|estimate|estimated|assume|assumed|placeholder|unknown|not disclosed|not found|shortcut|rough)\b/i

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function asNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

async function secJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      Accept: "application/json",
    },
  })
  if (!response.ok) throw new Error(`SEC request failed ${response.status}: ${url}`)
  return response.json()
}

async function tickerMap() {
  const raw = await secJson("https://www.sec.gov/files/company_tickers.json")
  return new Map(Object.values(raw).map((row) => [row.ticker.toUpperCase(), {
    cik: String(row.cik_str).padStart(10, "0"),
    title: row.title,
    ticker: row.ticker.toUpperCase(),
  }]))
}

function factUnits(facts, name) {
  // Most facts are under us-gaap, but some (e.g. EntityCommonStockSharesOutstanding)
  // live in the dei taxonomy — check both.
  return facts?.["us-gaap"]?.[name]?.units || facts?.["dei"]?.[name]?.units || {}
}

function unitRows(facts, name, unit = "USD") {
  const units = factUnits(facts, name)
  return units[unit] || Object.values(units)[0] || []
}

function rowDurationDays(row) {
  if (!row.start || !row.end) return 0
  return (new Date(row.end) - new Date(row.start)) / 86_400_000
}

function annualRows(facts, name, unit = "USD", options = {}) {
  return unitRows(facts, name, unit)
    .filter((row) => {
      if (row.form !== "10-K" || !row.fy || row.val === undefined) return false
      if (!options.requireAnnualDuration) return true
      const duration = rowDurationDays(row)
      return row.fp === "FY" && duration >= 300 && duration <= 450
    })
    .sort((a, b) => String(a.end).localeCompare(String(b.end)) || String(a.start).localeCompare(String(b.start)))
}

function latestAnnual(facts, names, unit = "USD", options = {}) {
  for (const name of names) {
    const rows = annualRows(facts, name, unit, options)
    if (rows.length) return { tag: name, row: rows.at(-1), rows }
  }
  return { tag: "", row: null, rows: [] }
}

function annualValue(facts, names, unit = "USD", options = {}) {
  return asNumber(latestAnnual(facts, names, unit, options).row?.val)
}

function annualValueAtPeriod(facts, names, periodEnd, unit = "USD", options = {}) {
  if (!periodEnd) return 0
  for (const name of names) {
    const row = annualRows(facts, name, unit, options).find((item) => item.end === periodEnd)
    if (row) return asNumber(row.val)
  }
  return 0
}

function fiscalSeries(facts, names, unit = "USD", options = {}) {
  const found = latestAnnual(facts, names, unit, options)
  const byPeriodEnd = new Map()
  for (const row of found.rows) {
    byPeriodEnd.set(row.end, { fy: row.fy, periodEnd: row.end, value: asNumber(row.val), tag: found.tag })
  }
  return [...byPeriodEnd.values()].sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)))
}

function sumAnnual(facts, names) {
  return names.reduce((sum, name) => sum + annualValue(facts, [name]), 0)
}

function sourcePacketFor(company, facts) {
  const revenueSeries = fiscalSeries(facts, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "Revenues",
  ], "USD", { requireAnnualDuration: true })
  const latestRevenue = revenueSeries.at(-1)?.value || 0
  const priorRevenue = revenueSeries.at(-2)?.value || 0
  const latestPeriodEnd = revenueSeries.at(-1)?.periodEnd || ""
  const revenueGrowth = priorRevenue > 0 ? (latestRevenue - priorRevenue) / priorRevenue : 0
  const reportedGrossProfit = annualValueAtPeriod(facts, ["GrossProfit"], latestPeriodEnd, "USD", { requireAnnualDuration: true })
  const costOfRevenue = annualValueAtPeriod(facts, [
    "CostOfGoodsAndServicesSold",
    "CostOfRevenue",
    "CostOfGoodsSold",
    "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
  ], latestPeriodEnd, "USD", { requireAnnualDuration: true })
  const grossProfit = reportedGrossProfit || (latestRevenue > 0 && costOfRevenue > 0 ? latestRevenue - costOfRevenue : 0)
  const operatingIncome = annualValueAtPeriod(facts, ["OperatingIncomeLoss"], latestPeriodEnd, "USD", { requireAnnualDuration: true })
  const depreciationAmortization = Math.abs(annualValueAtPeriod(facts, [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
  ], latestPeriodEnd, "USD", { requireAnnualDuration: true }))
  // The engine treats (grossMargin - opexRatio) as EBITDA margin and subtracts capex
  // separately for FCF. So EBITDA = operating income + D&A, and opexRatio is opex
  // EXCLUDING D&A. Computing opex off operating income (D&A included) would double-count
  // depreciation against the separate capexPct input.
  const ebitda = operatingIncome + depreciationAmortization
  const netIncome = annualValueAtPeriod(facts, ["NetIncomeLoss", "ProfitLoss"], latestPeriodEnd, "USD", { requireAnnualDuration: true })
  const capex = Math.abs(annualValueAtPeriod(facts, [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "CapitalExpenditures",
  ], latestPeriodEnd, "USD", { requireAnnualDuration: true }))
  const cash = sumAnnual(facts, [
    "CashAndCashEquivalentsAtCarryingValue",
    "ShortTermInvestments",
  ])
  const debt = sumAnnual(facts, [
    "ShortTermBorrowings",
    "LongTermDebtCurrent",
    "LongTermDebtNoncurrent",
    "FinanceLeaseLiabilityCurrent",
    "FinanceLeaseLiabilityNoncurrent",
  ])
  const inventory = annualValue(facts, ["InventoryNet", "InventoryFinishedGoodsNetOfReserves"])
  const ar = annualValue(facts, ["AccountsReceivableNetCurrent", "AccountsReceivableNet"])
  const ap = annualValue(facts, ["AccountsPayableCurrent", "AccountsPayable"])
  const equity = annualValue(facts, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"])
  const assets = annualValue(facts, ["Assets"])
  const shares = annualValue(facts, ["EntityCommonStockSharesOutstanding"], "shares")
  const eps = annualValueAtPeriod(facts, ["EarningsPerShareDiluted"], latestPeriodEnd, "USD/shares", { requireAnnualDuration: true })

  return {
    ticker: company.ticker,
    companyName: company.title,
    cik: company.cik,
    secSource: `https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`,
    extractedAnnual: {
      revenue: latestRevenue,
      priorRevenue,
      revenueGrowth: round(revenueGrowth),
      grossProfit,
      grossMargin: latestRevenue > 0 ? round(grossProfit / latestRevenue) : 0,
      operatingIncome,
      operatingMargin: latestRevenue > 0 ? round(operatingIncome / latestRevenue) : 0,
      depreciationAmortization,
      ebitda,
      ebitdaMargin: latestRevenue > 0 ? round(ebitda / latestRevenue) : 0,
      // Engine-consistent opex: gross margin minus EBITDA margin (D&A excluded).
      opexRatioEbitdaBasis: latestRevenue > 0 && grossProfit ? round((grossProfit - ebitda) / latestRevenue) : 0,
      netIncome,
      netMargin: latestRevenue > 0 ? round(netIncome / latestRevenue) : 0,
      capex,
      capexPct: latestRevenue > 0 ? round(capex / latestRevenue) : 0,
      cash,
      debt,
      inventory,
      ar,
      ap,
      tangibleBookValueProxy: equity,
      assetBackingValueProxy: assets,
      sharesOutstanding: shares,
      eps,
    },
    revenueSeries,
  }
}

function buildPrompt(sourcePackets, promptDoc) {
  const n = sourcePackets.length
  return `${promptDoc}

Now prepare exactly ${n} ${n === 1 ? "company" : "companies"} using the SEC source packets below. Use web search for current market cap/share data, peer multiples, sector CAGR, TAM/SAM, dividend yield, and qualitative evidence. Do not invent fields that are not supported. For values not in the SEC packet or a searched source, use 0 or a conservative neutral default and put it in humanReview.

Return JSON only:
{
  "companies": [
    { "ticker": "TICKER", "inputs": {}, "sourceNotes": {}, "humanReview": [] }
  ]
}

Mandatory hallucination controls:
- Every non-zero financial-statement field must have a sourceNotes entry.
- Every peer multiple must have a sourceNotes entry naming the peer set and data provider.
- Every current market value must have a sourceNotes entry naming the date and source.
- Every score >= 8 must have either a sourceNotes evidence note or a humanReview flag.
- If you estimate TAM, SAM, sectorCAGR, brand recognition, churn, NRR, moat, or management, flag it.

SEC source packets:
${JSON.stringify(sourcePackets, null, 2)}`
}

function parseJsonBlock(text) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

// $ per 1M tokens. Web search is billed separately per request.
const PRICING = {
  "claude-sonnet-4-6": { input: 3, output: 15, note: "standard" },
  "claude-sonnet-5": { input: 2, output: 10, note: "standard" },
  "claude-opus-5": { input: 5, output: 25, note: "standard" },
}
const WEB_SEARCH_COST_PER_1K = 10 // $ per 1,000 web searches

function accumulateUsage(total, usage) {
  if (!usage) return
  total.input_tokens += usage.input_tokens || 0
  total.output_tokens += usage.output_tokens || 0
  total.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0
  total.cache_read_input_tokens += usage.cache_read_input_tokens || 0
  total.web_search_requests += usage.server_tool_use?.web_search_requests || 0
}

async function callAnthropic(prompt) {
  if (!AI_INGESTION_ENABLED) throw new Error("AI ingestion is disabled by default. Set ENABLE_AI_INGESTION=1 to enable this audited fallback explicitly.")
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY is not set")
  const messages = [{ role: "user", content: prompt }]
  const tools = ENABLE_WEB_SEARCH
    ? [{
      type: "web_search_20260318",
      name: "web_search",
      max_uses: WEB_SEARCH_MAX_USES,
      response_inclusion: "excluded",
    }]
    : undefined
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0 }
  let payloadText = ""

  // Loop to resume across pause_turn (the server-side web-search loop can pause).
  for (let hop = 0; hop < 10; hop += 1) {
    const body = { model: MODEL, max_tokens: 12000, messages }
    if (tools) body.tools = tools
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(`Anthropic request failed ${response.status}: ${JSON.stringify(data)}`)
    accumulateUsage(usage, data.usage)
    if (data.stop_reason === "refusal") {
      throw new Error(`Model declined the request (category: ${data.stop_details?.category ?? "unknown"})`)
    }
    if (data.stop_reason === "pause_turn") {
      // Resend with the paused assistant turn appended; the server resumes automatically.
      messages.push({ role: "assistant", content: data.content })
      continue
    }
    payloadText = (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n")
    break
  }
  return { payload: parseJsonBlock(payloadText), usage }
}

function reportCost(usage, stocks) {
  const price = PRICING[MODEL] || { input: 3, output: 15, note: "assumed Sonnet-tier pricing" }
  const inputCost = ((usage.input_tokens + usage.cache_creation_input_tokens) / 1e6) * price.input
  const cacheReadCost = (usage.cache_read_input_tokens / 1e6) * price.input * 0.1
  const outputCost = (usage.output_tokens / 1e6) * price.output
  const searchCost = (usage.web_search_requests / 1000) * WEB_SEARCH_COST_PER_1K
  const tokenCost = inputCost + cacheReadCost + outputCost
  const total = tokenCost + searchCost
  console.log(`\n=== Cost (${MODEL} — ${price.note}) ===`)
  console.log(`  input ${usage.input_tokens} tok | output ${usage.output_tokens} tok | web searches ${usage.web_search_requests}`)
  console.log(`  tokens $${tokenCost.toFixed(4)} + search $${searchCost.toFixed(4)} = $${total.toFixed(4)} total for ${stocks} stock(s)`)
  console.log(`  cost per searched stock: $${(total / Math.max(stocks, 1)).toFixed(4)}`)
}

function pct(value) {
  return `${Math.round(value * 100)}%`
}

function money(value) {
  return Math.abs(value) >= 1e9 ? `$${(value / 1e9).toFixed(1)}B` : `$${(value / 1e6).toFixed(1)}M`
}

function closeEnough(actual, expected, tolerance = 0.08) {
  if (!(expected > 0)) return true
  return Math.abs(actual - expected) / expected <= tolerance
}

function auditCompany(companyPayload, packet) {
  const issues = []
  const inputs = normalizeInputs(companyPayload.inputs || {})
  const notes = companyPayload.sourceNotes || {}
  const humanReview = Array.isArray(companyPayload.humanReview) ? companyPayload.humanReview : []
  const humanFields = new Set(humanReview.map((item) => item.field))
  const source = packet?.extractedAnnual || {}

  for (const field of CORE_NUMERIC_FIELDS) {
    const value = inputs[field]
    const isDefault = DEFAULT_INPUTS[field] === value
    if (value !== 0 && !notes[field]) issues.push(`${field}: non-zero value lacks sourceNotes`)
    if (isDefault && !notes[field] && !humanFields.has(field)) issues.push(`${field}: still at default with no source or review flag`)
    if (notes[field] && FLAG_WORDS.test(notes[field]) && !humanFields.has(field)) issues.push(`${field}: source note admits estimate/unknown but humanReview does not flag it`)
  }

  for (const field of SUBJECTIVE_FIELDS) {
    const value = inputs[field]
    const high = field === "targetMarketRecognitionPct" ? value >= 0.8 : value >= 8
    if (high && !notes[field] && !humanFields.has(field)) issues.push(`${field}: high qualitative score lacks evidence or human review`)
  }

  const comparisons = [
    ["revenue", inputs.revenue, source.revenue],
    ["revenueGrowth", inputs.revenueGrowth, source.revenueGrowth],
    ["grossMargin", inputs.grossMargin, source.grossMargin],
    ["opexRatio", inputs.opexRatio, source.opexRatioEbitdaBasis],
    ["capexPct", inputs.capexPct, source.capexPct],
    ["cash", inputs.cash, source.cash],
    ["debt", inputs.debt, source.debt],
    ["inventory", inputs.inventory, source.inventory],
    ["ar", inputs.ar, source.ar],
    ["ap", inputs.ap, source.ap],
    ["eps", inputs.eps, source.eps],
  ]
  for (const [field, actual, expected] of comparisons) {
    if (expected > 0 && actual > 0 && !closeEnough(actual, expected, MONEY_FIELDS.has(field) ? 0.12 : 0.08)) {
      issues.push(`${field}: differs from SEC packet by more than tolerance (${actual} vs ${expected})`)
    }
  }

  if (inputs.capitalStatus === "Public" && !(inputs.marketCapOverride > 0 || (inputs.sharePrice > 0 && inputs.sharesOutstanding > 0))) {
    issues.push("public market cap missing: provide marketCapOverride or sharePrice + sharesOutstanding")
  }
  if (inputs.competitorCount > 0 && !(inputs.competitorEvRevenue > 0 || inputs.competitorEvEbitda > 0 || inputs.competitorEvFcf > 0 || inputs.competitorPe > 0)) {
    issues.push("competitorCount supplied without usable peer multiples")
  }

  return issues
}

function report(companies, packets) {
  const byTicker = new Map(packets.map((packet) => [packet.ticker, packet]))
  console.log(`\n=== Anthropic ${MODEL} three-company engine run ===`)
  console.log("Company".padEnd(24), "Fair equity".padStart(13), "Band".padStart(23), "Conf".padStart(6), "Issues".padStart(7))
  for (const payload of companies) {
    const ticker = String(payload.ticker || payload.inputs?.ticker || "").toUpperCase()
    const packet = byTicker.get(ticker)
    const issues = auditCompany(payload, packet)
    const result = computeValuation(payload.inputs || {})
    const band = `${money(result.bands.final.low)}-${money(result.bands.final.high)}`
    console.log(
      result.input.companyName.padEnd(24),
      money(result.outputs.fairCommonEquity).padStart(13),
      band.padStart(23),
      pct(result.bands.quality).padStart(6),
      String(issues.length).padStart(7)
    )
    if (issues.length) {
      console.log(`  ${ticker || result.input.companyName} audit flags:`)
      for (const issue of issues.slice(0, 12)) console.log(`   - ${issue}`)
      if (issues.length > 12) console.log(`   - ...${issues.length - 12} more`)
    }
    console.log(`  signals: financial=${pct(result.ledger.signals.coreFinancialJustification.effective)} pressure=${pct(result.ledger.signals.marketMultiplePressure.effective)} brand=${pct(result.ledger.signals.brandDurability.effective)} durability=${pct(result.ledger.signals.durability.effective)}`)
  }
}

async function main() {
  const map = await tickerMap()
  const companies = tickers.map((ticker) => {
    const company = map.get(ticker)
    if (!company) throw new Error(`Ticker not found in SEC company_tickers.json: ${ticker}`)
    return company
  })
  const packets = []
  for (const company of companies) {
    const facts = await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`)
    packets.push(sourcePacketFor(company, facts.facts))
  }

  if (DRY_RUN) {
    console.log(JSON.stringify({ model: MODEL, tickers, packets }, null, 2))
    return
  }

  const promptDoc = await fs.readFile(new URL("../AI_AUTOMATION_PROMPTS.md", import.meta.url), "utf8")
  const { payload, usage } = await callAnthropic(buildPrompt(packets, promptDoc))
  const companiesOut = payload.companies || []
  if (companiesOut.length !== tickers.length) throw new Error(`Expected ${tickers.length} compan${tickers.length === 1 ? "y" : "ies"}, received ${companiesOut.length}`)
  report(companiesOut, packets)
  reportCost(usage, tickers.length)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
