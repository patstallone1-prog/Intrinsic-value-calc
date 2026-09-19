const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
const SEC_FACTS_URL = (cik) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`
const SEC_SUBMISSIONS_URL = (cik) => `https://data.sec.gov/submissions/CIK${cik}.json`

const FLOW_TAGS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "Revenues"],
  grossProfit: ["GrossProfit"],
  costOfRevenue: ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"],
  operatingIncome: ["OperatingIncomeLoss"],
  operatingExpenses: ["OperatingExpenses"],
  sellingGeneralAdministrative: ["SellingGeneralAndAdministrativeExpense"],
  otherOperatingExpense: ["OtherOperatingIncomeExpenseNet", "OtherOperatingExpense"],
  depreciationAmortization: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireOtherPropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "CapitalExpenditures"],
  researchDevelopment: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  dividendsPaid: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock", "PaymentsOfOrdinaryDividends"],
  buybacks: ["PaymentsForRepurchaseOfCommonStock"],
  eps: ["EarningsPerShareDiluted"],
}

const INSTANT_TAGS = {
  cash: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashAndCashEquivalentsAtCarryingValue"],
  shortTermInvestments: ["ShortTermInvestments", "MarketableSecuritiesCurrent"],
  debtCurrent: ["ShortTermBorrowings", "LongTermDebtCurrent", "ShortTermDebtCurrent"],
  debtLongTerm: ["LongTermDebtNoncurrent"],
  financeLeaseCurrent: ["FinanceLeaseLiabilityCurrent"],
  financeLeaseLongTerm: ["FinanceLeaseLiabilityNoncurrent"],
  inventory: ["InventoryNet", "InventoryFinishedGoodsNetOfReserves"],
  ar: ["AccountsReceivableNetCurrent", "AccountsReceivableNet"],
  ap: ["AccountsPayableCurrent", "AccountsPayable"],
  assets: ["Assets"],
  liabilities: ["Liabilities"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  goodwill: ["Goodwill"],
  intangibles: ["FiniteLivedIntangibleAssetsNet", "IndefiniteLivedIntangibleAssetsExcludingGoodwill", "IntangibleAssetsNetExcludingGoodwill"],
  propertyPlantEquipment: ["PropertyPlantAndEquipmentNet"],
  land: ["Land"],
  sharesOutstanding: ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"],
}

const ENGINE_FINANCIAL_FIELDS = [
  "revenue", "revenueGrowth", "grossMargin", "marginChangeYoy", "opexRatio", "rdPct", "cash", "debt",
  "capexPct", "inventory", "ar", "ap", "tangibleBookValue", "assetBackingValue", "roe", "rotce",
  "buybackYield", "dividendYield", "eps", "sharePrice", "sharesOutstanding", "marketCapOverride",
]

const SIC_RULES = [
  [/software|prepackaged|data processing|computer programming|information retrieval/i, ["SaaS / Enterprise Software", "Software / Subscription"]],
  [/bank|credit|security broker|insurance|investment advice|finance/i, ["Fintech / Financial Services", "Financial / Balance-Sheet Business"]],
  [/pharmaceutical|biological|medicinal|biotech/i, ["Biotech Therapeutics", "Biopharma / R&D Asset"]],
  [/medical|surgical|diagnostic|laboratory/i, ["Medical Devices", "Tools / Devices / Equipment"]],
  [/aircraft|missile|space|defense/i, ["Aerospace / Space / Defense", "Manufacturing / Production"]],
  [/retail|grocery|department store|catalog|e-commerce|wholesale/i, ["Consumer Products / Retail / E-commerce", "Retail / Commerce / Distribution"]],
  [/transportation|trucking|shipping|courier|warehouse/i, ["Logistics / Supply Chain", "Asset-Heavy Operator"]],
  [/real estate|construction|homebuilder/i, ["Real Estate / Construction / PropTech", "Asset-Heavy Operator"]],
  [/electric|gas|water|utility|power generation/i, ["Clean Energy / Climate", "Asset-Heavy Operator"]],
  [/chemical|material|mining|mineral/i, ["Advanced Materials / Chemicals", "Manufacturing / Production"]],
  [/manufactur|industrial|machinery|equipment/i, ["Manufacturing / Industrials", "Manufacturing / Production"]],
  [/restaurant|food|beverage|agricultur/i, ["Agriculture / Food / Bioeconomy", "Product / Hardware"]],
  [/hospital|health service|nursing/i, ["Healthcare Services", "Services / Labor-Based"]],
]

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function factUnits(facts, tag) {
  return facts?.["us-gaap"]?.[tag]?.units || facts?.dei?.[tag]?.units || facts?.["ifrs-full"]?.[tag]?.units || {}
}

function rowsForTag(facts, tag, preferredUnit = "USD") {
  const units = factUnits(facts, tag)
  return units[preferredUnit] || Object.values(units)[0] || []
}

function durationDays(row) {
  if (!row.start || !row.end) return 0
  return (new Date(row.end) - new Date(row.start)) / 86_400_000
}

function dedupePeriods(rows) {
  const byPeriod = new Map()
  for (const row of rows) {
    const key = `${row.start || "instant"}:${row.end}`
    const current = byPeriod.get(key)
    if (!current || String(row.filed || "") > String(current.filed || "")) byPeriod.set(key, row)
  }
  return [...byPeriod.values()].sort((a, b) => String(a.end).localeCompare(String(b.end)))
}

function annualRowsForTag(facts, tag, unit = "USD") {
  return dedupePeriods(rowsForTag(facts, tag, unit).filter((row) => {
      if (!(row.val !== undefined && row.end)) return false
      const annualForm = ["10-K", "20-F", "40-F"].includes(row.form)
      const duration = durationDays(row)
      return annualForm && duration >= 300 && duration <= 450 && (!row.fp || row.fp === "FY")
    }))
}

function annualRows(facts, tags, unit = "USD") {
  const candidates = tags
    .map((tag) => ({ tag, rows: annualRowsForTag(facts, tag, unit) }))
    .filter((candidate) => candidate.rows.length)
    .sort((a, b) => String(b.rows.at(-1).end).localeCompare(String(a.rows.at(-1).end)) || b.rows.length - a.rows.length)
  return candidates[0] || { tag: "", rows: [] }
}

function annualSeries(facts, tags, unit = "USD") {
  const { tag, rows } = annualRows(facts, tags, unit)
  return rows.map((row) => ({ tag, start: row.start, end: row.end, fy: row.fy, filed: row.filed, value: number(row.val) }))
}

function annualAt(facts, tags, periodEnd, unit = "USD") {
  if (!periodEnd) return { tag: "", value: 0, row: null }
  for (const tag of tags) {
    const row = annualRowsForTag(facts, tag, unit).filter((item) => item.end === periodEnd).at(-1)
    if (row) return { tag, value: number(row.val), row }
  }
  return { tag: "", value: 0, row: null }
}

function instantAt(facts, tags, periodEnd, unit = "USD") {
  for (const tag of tags) {
    const candidates = rowsForTag(facts, tag, unit)
      .filter((row) => row.val !== undefined && row.end && (!periodEnd || row.end === periodEnd) && ["10-K", "20-F", "40-F", "10-Q", "6-K"].includes(row.form))
      .sort((a, b) => String(a.end).localeCompare(String(b.end)) || String(a.filed).localeCompare(String(b.filed)))
    if (candidates.length) {
      const row = candidates.at(-1)
      return { tag, value: number(row.val), row }
    }
  }
  return { tag: "", value: 0, row: null }
}

function sumValues(items) {
  return items.reduce((sum, item) => sum + Math.max(number(item.value), 0), 0)
}

export function classifyCompany(sicDescription = "") {
  for (const [pattern, classification] of SIC_RULES) {
    if (pattern.test(sicDescription)) return { sector: classification[0], businessModel: classification[1] }
  }
  return { sector: "Other", businessModel: "Other" }
}

export function emptyNormalizedCompany(ticker) {
  return {
    provider: "None",
    ticker,
    cik: "",
    periodEnd: "",
    inputs: {
      companyName: ticker,
      sector: "Other",
      businessModel: "Other",
      lifecycleStage: "Profitable / Mature",
      profitabilityStatus: "Profitable",
      capitalStatus: "Public",
    },
    rawMetrics: { dividendsPaid: 0, buybacks: 0 },
    sourceNotes: {},
    provenance: [],
    coverage: [],
    warnings: [],
  }
}

function lifecycleFromFinancials(revenueGrowth, netIncome, freeCashFlow) {
  if (netIncome > 0 && freeCashFlow > 0 && revenueGrowth < 0.12) return { lifecycleStage: "Profitable / Mature", profitabilityStatus: "FCF Positive" }
  if (freeCashFlow > 0) return { lifecycleStage: "Late-Stage Growth", profitabilityStatus: "FCF Positive" }
  if (netIncome > 0) return { lifecycleStage: "Late-Stage Growth", profitabilityStatus: "Profitable" }
  return { lifecycleStage: revenueGrowth > 0.25 ? "Scaling" : "Early Revenue", profitabilityStatus: "Revenue-Generating / Unprofitable" }
}

function sourceRecord(provider, metric, value, detail, date = "") {
  return { provider, metric, value: round(value, 6), detail, date }
}

export function normalizeSecCompany({ company, submissions = {}, facts = {} }) {
  const revenueSeries = annualSeries(facts, FLOW_TAGS.revenue)
  const revenue = revenueSeries.at(-1)?.value || 0
  const priorRevenue = revenueSeries.at(-2)?.value || 0
  const periodEnd = revenueSeries.at(-1)?.end || ""
  const priorPeriodEnd = revenueSeries.at(-2)?.end || ""
  const flow = (key, end = periodEnd, unit = key === "eps" ? "USD/shares" : "USD") => annualAt(facts, FLOW_TAGS[key], end, unit)
  const instant = (key, end = periodEnd, unit = key === "sharesOutstanding" ? "shares" : "USD") => instantAt(facts, INSTANT_TAGS[key], end, unit)

  const grossReported = flow("grossProfit")
  const cost = flow("costOfRevenue")
  const grossProfit = grossReported.value || (revenue > 0 && cost.value > 0 ? revenue - cost.value : 0)
  const priorGrossReported = flow("grossProfit", priorPeriodEnd)
  const priorCost = flow("costOfRevenue", priorPeriodEnd)
  const priorGrossProfit = priorGrossReported.value || (priorRevenue > 0 && priorCost.value > 0 ? priorRevenue - priorCost.value : 0)
  const operatingIncome = flow("operatingIncome")
  const operatingExpenses = flow("operatingExpenses")
  const sellingGeneralAdministrative = flow("sellingGeneralAdministrative")
  const otherOperatingExpense = flow("otherOperatingExpense")
  const da = flow("depreciationAmortization")
  const netIncome = flow("netIncome")
  const capex = flow("capex")
  const rd = flow("researchDevelopment")
  const operatingCashFlow = flow("operatingCashFlow")
  const dividendsPaid = flow("dividendsPaid")
  const buybacks = flow("buybacks")
  const eps = flow("eps")
  const cash = instant("cash")
  const shortTermInvestments = instant("shortTermInvestments")
  const debtParts = [instant("debtCurrent"), instant("debtLongTerm"), instant("financeLeaseCurrent"), instant("financeLeaseLongTerm")]
  const inventory = instant("inventory")
  const ar = instant("ar")
  const ap = instant("ap")
  const assets = instant("assets")
  const liabilities = instant("liabilities")
  const equity = instant("equity")
  const goodwill = instant("goodwill")
  const intangibles = instant("intangibles")
  const ppe = instant("propertyPlantEquipment")
  const land = instant("land")
  const shares = instant("sharesOutstanding", "", "shares")
  const priorEquity = instant("equity", priorPeriodEnd)

  const grossMargin = revenue > 0 ? grossProfit / revenue : 0
  const priorGrossMargin = priorRevenue > 0 ? priorGrossProfit / priorRevenue : 0
  const componentOperatingExpenses = Math.abs(sellingGeneralAdministrative.value) + Math.abs(rd.value) + Math.abs(otherOperatingExpense.value)
  const derivedOperatingIncome = operatingIncome.row
    ? operatingIncome.value
    : grossProfit - (operatingExpenses.row ? operatingExpenses.value : componentOperatingExpenses)
  const ebitda = derivedOperatingIncome + Math.abs(da.value)
  const freeCashFlow = operatingCashFlow.value - Math.abs(capex.value)
  const totalCash = cash.value + shortTermInvestments.value
  const debt = sumValues(debtParts)
  const tangibleBook = Math.max(equity.value - goodwill.value - intangibles.value, 0)
  const averageEquity = priorEquity.value > 0 ? (equity.value + priorEquity.value) / 2 : equity.value
  const averageTangibleEquity = priorEquity.value > 0
    ? Math.max(((equity.value - goodwill.value - intangibles.value) + Math.max(priorEquity.value - goodwill.value - intangibles.value, 0)) / 2, 0)
    : tangibleBook
  const revenueGrowth = priorRevenue > 0 ? (revenue - priorRevenue) / priorRevenue : 0
  const classification = classifyCompany(submissions.sicDescription)
  const lifecycle = lifecycleFromFinancials(revenueGrowth, netIncome.value, freeCashFlow)

  const inputs = {
    companyName: company.title || submissions.name || company.ticker,
    ...classification,
    ...lifecycle,
    capitalStatus: "Public",
    revenue: round(revenue, 2),
    revenueGrowth: round(revenueGrowth),
    grossMargin: round(grossMargin),
    marginChangeYoy: round(grossMargin - priorGrossMargin),
    opexRatio: revenue > 0 ? round(Math.max((grossProfit - ebitda) / revenue, 0)) : 0,
    rdPct: revenue > 0 ? round(Math.abs(rd.value) / revenue) : 0,
    cash: round(totalCash, 2),
    debt: round(debt, 2),
    capexPct: revenue > 0 ? round(Math.abs(capex.value) / revenue) : 0,
    inventory: round(inventory.value, 2),
    ar: round(ar.value, 2),
    ap: round(ap.value, 2),
    tangibleBookValue: round(tangibleBook, 2),
    assetBackingValue: round(Math.max(equity.value, assets.value - liabilities.value, 0), 2),
    roe: averageEquity > 0 ? round(netIncome.value / averageEquity) : 0,
    rotce: averageTangibleEquity > 0 ? round(netIncome.value / averageTangibleEquity) : 0,
    sharesOutstanding: round(shares.value, 2),
    eps: round(eps.value, 4),
    asset1Type: land.value > 0 ? "Land / Owned Real Estate" : ppe.value > 0 ? "Equipment / Machinery" : "None",
    asset1Value: round(land.value || ppe.value, 2),
    asset2Type: shortTermInvestments.value > 0 ? "Public Securities / Investments" : "None",
    asset2Value: round(shortTermInvestments.value, 2),
  }

  const rawMetrics = {
    revenue, priorRevenue, grossProfit, priorGrossProfit, operatingIncome: derivedOperatingIncome,
    operatingExpenses: operatingExpenses.value || componentOperatingExpenses,
    depreciationAmortization: Math.abs(da.value), ebitda, netIncome: netIncome.value,
    operatingCashFlow: operatingCashFlow.value, capex: Math.abs(capex.value), freeCashFlow,
    dividendsPaid: Math.abs(dividendsPaid.value), buybacks: Math.abs(buybacks.value),
    totalAssets: assets.value, totalLiabilities: liabilities.value, equity: equity.value,
    goodwill: goodwill.value, intangibles: intangibles.value, propertyPlantEquipment: ppe.value, land: land.value,
  }

  const sourceNotes = {}
  for (const [field, value] of Object.entries(inputs)) {
    if (typeof value !== "number" || value === 0) continue
    sourceNotes[field] = `SEC Company Facts; normalized from annual filing ending ${periodEnd || "latest"}`
  }
  const provenance = [
    sourceRecord("SEC Company Facts", "revenue", revenue, revenueSeries.at(-1)?.tag || "", periodEnd),
    sourceRecord("SEC Company Facts", "netIncome", netIncome.value, netIncome.tag, periodEnd),
    sourceRecord("SEC Company Facts", "operatingCashFlow", operatingCashFlow.value, operatingCashFlow.tag, periodEnd),
    sourceRecord("SEC Company Facts", "sharesOutstanding", shares.value, shares.tag, shares.row?.end || ""),
  ].filter((item) => item.value !== 0)

  const availableFields = new Set()
  if (revenueSeries.length) availableFields.add("revenue")
  if (revenueSeries.length > 1) availableFields.add("revenueGrowth")
  if (grossReported.row || cost.row) availableFields.add("grossMargin")
  if ((priorGrossReported.row || priorCost.row) && (grossReported.row || cost.row)) availableFields.add("marginChangeYoy")
  if (operatingIncome.row || operatingExpenses.row || sellingGeneralAdministrative.row) availableFields.add("opexRatio")
  if (rd.row) availableFields.add("rdPct")
  if (cash.row || shortTermInvestments.row) availableFields.add("cash")
  if (debtParts.some((item) => item.row)) availableFields.add("debt")
  if (capex.row) availableFields.add("capexPct")
  if (inventory.row) availableFields.add("inventory")
  if (ar.row) availableFields.add("ar")
  if (ap.row) availableFields.add("ap")
  if (equity.row) availableFields.add("assetBackingValue")
  if (equity.row && (goodwill.row || intangibles.row || equity.value !== 0)) availableFields.add("tangibleBookValue")
  if (equity.row && netIncome.row) availableFields.add("roe")
  if (equity.row && netIncome.row) availableFields.add("rotce")
  if (shares.row) availableFields.add("sharesOutstanding")
  if (eps.row) availableFields.add("eps")
  const coverage = [...availableFields]
  return {
    provider: "SEC",
    ticker: company.ticker,
    cik: company.cik,
    periodEnd,
    inputs,
    rawMetrics,
    sourceNotes,
    provenance,
    coverage,
    availableFields: coverage,
    warnings: revenue > 0 ? [] : ["SEC filing did not yield annual revenue; an alternate provider is required."],
  }
}

export function normalizeMarketSeries(seriesByProvider, sharesOutstanding = 0) {
  const valid = seriesByProvider.filter((item) => item && (item.currentPrice > 0 || item.prices?.length))
  const currentCandidates = valid.map((item) => item.currentPrice).filter((value) => value > 0)
  const currentPrice = median(currentCandidates)
  const primary = valid.find((item) => item.provider === "Yahoo Finance" && item.prices?.length)
    || valid.find((item) => item.prices?.length)
    || valid[0]
  const recentPrices = (primary?.prices || []).filter((value) => value > 0).slice(-20)
  const averagePrice = recentPrices.length ? recentPrices.reduce((sum, value) => sum + value, 0) / recentPrices.length : currentPrice
  const divergence = currentCandidates.length > 1 && currentPrice > 0
    ? Math.max(...currentCandidates.map((value) => Math.abs(value - currentPrice) / currentPrice))
    : 0
  return {
    currentPrice: round(currentPrice, 4),
    averagePrice: round(averagePrice, 4),
    tradingDays: recentPrices.length,
    currentMarketCap: round(currentPrice * sharesOutstanding, 2),
    averageMarketCap: round(averagePrice * sharesOutstanding, 2),
    annualDividendPerShare: round(number(primary?.annualDividendPerShare), 6),
    asOf: primary?.asOf || "",
    providers: valid.map((item) => item.provider),
    warning: divergence > 0.03 ? `Market-price providers differ by ${round(divergence * 100, 1)}%.` : "",
  }
}

export function finalizeNormalizedInputs(secNormalized, marketSnapshot, supplements = []) {
  const inputs = { ...secNormalized.inputs }
  const sourceNotes = { ...secNormalized.sourceNotes }
  const warnings = [...secNormalized.warnings]
  const provenance = [...secNormalized.provenance]
  const availableFields = new Set(secNormalized.availableFields || secNormalized.coverage || [])

  for (const supplement of supplements) {
    for (const [field, value] of Object.entries(supplement.inputs || {})) {
      if (typeof value === "string") {
        if (!inputs[field] || inputs[field] === "Other" || inputs[field] === secNormalized.ticker) {
          inputs[field] = value
          sourceNotes[field] = `${supplement.provider}; issuer profile fallback`
        }
        continue
      }
      if (typeof value !== "number" || value === 0) continue
      availableFields.add(field)
      if (!(typeof inputs[field] === "number" && inputs[field] !== 0)) {
        inputs[field] = value
        sourceNotes[field] = `${supplement.provider}; fallback because primary filing value was unavailable`
      } else if (Math.abs(inputs[field] - value) / Math.max(Math.abs(inputs[field]), 1) > 0.12) {
        warnings.push(`${field} differs by more than 12% between SEC and ${supplement.provider}; SEC retained.`)
      }
    }
    provenance.push(...(supplement.provenance || []))
    warnings.push(...(supplement.warnings || []))
  }

  if (marketSnapshot.averagePrice > 0) {
    inputs.sharePrice = marketSnapshot.averagePrice
    sourceNotes.sharePrice = `${marketSnapshot.tradingDays}-trading-day average from ${marketSnapshot.providers.join(" + ")}; as of ${marketSnapshot.asOf}`
    availableFields.add("sharePrice")
  }
  const marketBase = marketSnapshot.averageMarketCap || marketSnapshot.currentMarketCap
  if (marketBase > 0) {
    inputs.dividendYield = secNormalized.rawMetrics.dividendsPaid > 0
      ? round(secNormalized.rawMetrics.dividendsPaid / marketBase)
      : marketSnapshot.annualDividendPerShare > 0 && marketSnapshot.averagePrice > 0
        ? round(marketSnapshot.annualDividendPerShare / marketSnapshot.averagePrice)
        : 0
    inputs.buybackYield = round(secNormalized.rawMetrics.buybacks / marketBase)
    sourceNotes.dividendYield = secNormalized.rawMetrics.dividendsPaid > 0
      ? "Annual cash dividends paid divided by recent average market capitalization"
      : "Trailing market-feed dividends per share divided by recent average share price"
    sourceNotes.buybackYield = "Annual common-stock repurchases divided by recent average market capitalization"
  }
  if (marketSnapshot.warning) warnings.push(marketSnapshot.warning)

  const applicable = applicableFinancialFields(inputs)
  const missing = applicable.filter((field) => !availableFields.has(field))
  return {
    inputs,
    sourceNotes,
    provenance,
    warnings: [...new Set(warnings)],
    missing,
    coverage: {
      populated: applicable.length - missing.length,
      total: applicable.length,
      percent: round((applicable.length - missing.length) / applicable.length),
    },
  }
}

function applicableFinancialFields(inputs) {
  const financial = inputs.businessModel === "Financial / Balance-Sheet Business"
  const fields = ["revenue", "revenueGrowth", "cash", "debt", "tangibleBookValue", "assetBackingValue", "roe", "rotce", "eps", "sharePrice", "sharesOutstanding"]
  if (!financial) fields.push("grossMargin", "marginChangeYoy", "opexRatio", "capexPct")
  if (/Software|Biotech|Life Sciences|Medical Devices|Aerospace/.test(`${inputs.sector} ${inputs.businessModel}`)) fields.push("rdPct")
  if (/Retail|Manufacturing|Product|Hardware|Equipment|Asset-Heavy/.test(`${inputs.sector} ${inputs.businessModel}`)) fields.push("inventory", "ar", "ap")
  return fields
}

export async function fetchJson(url, { headers = {}, timeoutMs = 18_000 } = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`)
  return response.json()
}

export async function fetchSecBundle(ticker, secUserAgent) {
  const headers = { "User-Agent": secUserAgent, Accept: "application/json" }
  const tickerRows = await fetchJson(SEC_TICKERS_URL, { headers })
  const match = Object.values(tickerRows).find((row) => String(row.ticker).toUpperCase() === ticker.toUpperCase())
  if (!match) throw new Error(`Ticker ${ticker} was not found in the SEC issuer map.`)
  const company = { ticker: String(match.ticker).toUpperCase(), title: match.title, cik: String(match.cik_str).padStart(10, "0") }
  const [companyFacts, submissions] = await Promise.all([
    fetchJson(SEC_FACTS_URL(company.cik), { headers }),
    fetchJson(SEC_SUBMISSIONS_URL(company.cik), { headers }),
  ])
  return { company, facts: companyFacts.facts || {}, submissions }
}

export async function fetchYahooMarketSeries(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d&events=div%2Csplits`
  const payload = await fetchJson(url, { headers: { "User-Agent": "Mozilla/5.0 EvalSystem2/1.0" } })
  const result = payload?.chart?.result?.[0]
  if (!result) throw new Error(payload?.chart?.error?.description || "Yahoo Finance returned no chart data.")
  const prices = (result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || []).map(number).filter((value) => value > 0)
  const annualDividendPerShare = Object.values(result.events?.dividends || {}).reduce((sum, event) => sum + number(event.amount), 0)
  return {
    provider: "Yahoo Finance",
    currentPrice: number(result.meta?.regularMarketPrice) || prices.at(-1) || 0,
    prices,
    annualDividendPerShare,
    asOf: result.meta?.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString() : "",
  }
}

export async function fetchAlphaVantageSupplement(ticker, apiKey) {
  if (!apiKey) return null
  const base = "https://www.alphavantage.co/query"
  const [overview, quote] = await Promise.all([
    fetchJson(`${base}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`),
  ])
  const inputs = {
    companyName: overview.Name || ticker,
    ...classifyCompany(`${overview.Sector || ""} ${overview.Industry || ""}`),
    ...lifecycleFromFinancials(number(overview.QuarterlyRevenueGrowthYOY), number(overview.RevenueTTM) * number(overview.ProfitMargin), 0),
    capitalStatus: "Public",
    revenue: number(overview.RevenueTTM),
    grossMargin: number(overview.GrossProfitTTM) / Math.max(number(overview.RevenueTTM), 1),
    sharesOutstanding: number(overview.SharesOutstanding),
    eps: number(overview.EPS),
  }
  return {
    provider: "Alpha Vantage",
    inputs,
    marketSeries: {
      provider: "Alpha Vantage",
      currentPrice: number(quote?.["Global Quote"]?.["05. price"]),
      prices: [],
      asOf: quote?.["Global Quote"]?.["07. latest trading day"] || "",
    },
    provenance: Object.entries(inputs).filter(([, value]) => typeof value === "number" && value !== 0).map(([metric, value]) => sourceRecord("Alpha Vantage", metric, value, "OVERVIEW")),
    warnings: [],
  }
}

export async function fetchFmpSupplement(ticker, apiKey) {
  if (!apiKey) return null
  const base = "https://financialmodelingprep.com/api/v3"
  const [profileRows, incomeRows, balanceRows, cashRows] = await Promise.all([
    fetchJson(`${base}/profile/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/income-statement/${encodeURIComponent(ticker)}?limit=2&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/balance-sheet-statement/${encodeURIComponent(ticker)}?limit=1&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/cash-flow-statement/${encodeURIComponent(ticker)}?limit=1&apikey=${encodeURIComponent(apiKey)}`),
  ])
  const profile = profileRows?.[0] || {}
  const income = incomeRows?.[0] || {}
  const priorIncome = incomeRows?.[1] || {}
  const balance = balanceRows?.[0] || {}
  const cashFlow = cashRows?.[0] || {}
  const revenue = number(income.revenue)
  const priorRevenue = number(priorIncome.revenue)
  const debt = number(balance.shortTermDebt) + number(balance.longTermDebt)
  const freeCashFlow = number(cashFlow.freeCashFlow) || number(cashFlow.operatingCashFlow) - Math.abs(number(cashFlow.capitalExpenditure))
  const revenueGrowth = priorRevenue > 0 ? (revenue - priorRevenue) / priorRevenue : 0
  const inputs = {
    companyName: profile.companyName || ticker,
    ...classifyCompany(`${profile.sector || ""} ${profile.industry || ""}`),
    ...lifecycleFromFinancials(revenueGrowth, number(income.netIncome), freeCashFlow),
    capitalStatus: "Public",
    revenue,
    revenueGrowth,
    grossMargin: revenue > 0 ? number(income.grossProfit) / revenue : 0,
    opexRatio: revenue > 0 ? (number(income.grossProfit) - number(income.ebitda)) / revenue : 0,
    cash: number(balance.cashAndShortTermInvestments),
    debt,
    capexPct: revenue > 0 ? Math.abs(number(cashFlow.capitalExpenditure)) / revenue : 0,
    inventory: number(balance.inventory),
    ar: number(balance.netReceivables),
    ap: number(balance.accountPayables),
    sharesOutstanding: number(profile.mktCap) > 0 && number(profile.price) > 0 ? number(profile.mktCap) / number(profile.price) : 0,
    eps: number(income.epsdiluted || income.eps),
  }
  return {
    provider: "Financial Modeling Prep",
    inputs,
    marketSeries: { provider: "Financial Modeling Prep", currentPrice: number(profile.price), prices: [], asOf: income.date || "" },
    provenance: Object.entries(inputs).filter(([, value]) => typeof value === "number" && value !== 0).map(([metric, value]) => sourceRecord("Financial Modeling Prep", metric, value, "annual statements", income.date || "")),
    warnings: [],
  }
}

export { ENGINE_FINANCIAL_FIELDS }
