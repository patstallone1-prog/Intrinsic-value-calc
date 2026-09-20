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
    measuredRawMetrics: { dividendsPaid: false, buybacks: false },
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
  const sourceNotes = Object.fromEntries(coverage.map((field) => [
    field,
    `SEC Company Facts; ${inputs[field] === 0 ? "measured zero" : "normalized value"} from annual filing ending ${periodEnd || "latest"}`,
  ]))
  const provenance = [
    revenueSeries.length ? sourceRecord("SEC Company Facts", "revenue", revenue, revenueSeries.at(-1)?.tag || "", periodEnd) : null,
    netIncome.row ? sourceRecord("SEC Company Facts", "netIncome", netIncome.value, netIncome.tag, periodEnd) : null,
    operatingCashFlow.row ? sourceRecord("SEC Company Facts", "operatingCashFlow", operatingCashFlow.value, operatingCashFlow.tag, periodEnd) : null,
    shares.row ? sourceRecord("SEC Company Facts", "sharesOutstanding", shares.value, shares.tag, shares.row?.end || "") : null,
  ].filter(Boolean)
  return {
    provider: "SEC",
    ticker: company.ticker,
    cik: company.cik,
    periodEnd,
    inputs,
    rawMetrics,
    measuredRawMetrics: { dividendsPaid: Boolean(dividendsPaid.row), buybacks: Boolean(buybacks.row) },
    sourceNotes,
    provenance,
    coverage,
    availableFields: coverage,
    warnings: revenue > 0 ? [] : ["SEC filing did not yield annual revenue; an alternate provider is required."],
  }
}

function parseNasdaqNumber(raw, scale = 1) {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!text || text === "--" || /^n\/a$/i.test(text)) return null
  const percent = text.endsWith("%")
  const negative = text.startsWith("-") || /^\(.*\)$/.test(text)
  const parsed = Number(text.replace(/[$,%(),]/g, "").replace(/^-/, ""))
  if (!Number.isFinite(parsed)) return null
  const signed = negative ? -parsed : parsed
  return percent ? signed / 100 : signed * scale
}

function nasdaqRows(table) {
  return Array.isArray(table?.rows) ? table.rows : []
}

function nasdaqRowValue(table, labels, column = "value2", scale = 1_000) {
  const accepted = Array.isArray(labels) ? labels : [labels]
  const row = nasdaqRows(table).find((item) => accepted.some((label) => String(item.value1 || "").trim().toLowerCase() === label.toLowerCase()))
  return row ? parseNasdaqNumber(row[column], scale) : null
}

function nasdaqDate(value) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
}

export function normalizeNasdaqCompany({ ticker, financials = {}, info = {}, summary = {} }) {
  const financialData = financials.data || financials
  const infoData = info.data || info
  const summaryData = summary.data || summary
  const income = financialData?.incomeStatementTable
  const balance = financialData?.balanceSheetTable
  const cashFlow = financialData?.cashFlowTable
  const ratios = financialData?.financialRatiosTable
  const periodEnd = nasdaqDate(income?.headers?.value2 || "")

  const revenue = nasdaqRowValue(income, "Total Revenue")
  const priorRevenue = nasdaqRowValue(income, "Total Revenue", "value3")
  const grossProfit = nasdaqRowValue(income, "Gross Profit")
  const priorGrossProfit = nasdaqRowValue(income, "Gross Profit", "value3")
  const operatingIncome = nasdaqRowValue(income, "Operating Income")
  const depreciationAmortization = nasdaqRowValue(cashFlow, "Depreciation")
  const netIncome = nasdaqRowValue(income, ["Net Income", "Net Income-Cont. Operations"])
  const operatingCashFlow = nasdaqRowValue(cashFlow, "Net Cash Flow-Operating")
  const capex = nasdaqRowValue(cashFlow, "Capital Expenditures")
  const rd = nasdaqRowValue(income, "Research and Development")
  const cash = nasdaqRowValue(balance, "Cash and Cash Equivalents")
  const shortTermInvestments = nasdaqRowValue(balance, "Short-Term Investments")
  const debtCurrent = nasdaqRowValue(balance, "Short-Term Debt / Current Portion of Long-Term Debt")
  const debtLongTerm = nasdaqRowValue(balance, "Long-Term Debt")
  const inventory = nasdaqRowValue(balance, "Inventory")
  const ar = nasdaqRowValue(balance, "Net Receivables")
  const ap = nasdaqRowValue(balance, "Accounts Payable")
  const assets = nasdaqRowValue(balance, "Total Assets")
  const liabilities = nasdaqRowValue(balance, "Total Liabilities")
  const equity = nasdaqRowValue(balance, "Total Equity")
  const ppe = nasdaqRowValue(balance, "Fixed Assets")
  const roe = nasdaqRowValue(ratios, "After Tax ROE", "value2", 1)
  const currentPrice = parseNasdaqNumber(infoData?.primaryData?.lastSalePrice, 1)
  const currentMarketCap = parseNasdaqNumber(summaryData?.summaryData?.MarketCap?.value, 1)
  const annualDividendPerShare = parseNasdaqNumber(summaryData?.summaryData?.AnnualizedDividend?.value, 1)
  const sharesOutstanding = currentPrice > 0 && currentMarketCap > 0 ? currentMarketCap / currentPrice : null

  const totalCash = cash === null && shortTermInvestments === null ? null : (cash || 0) + (shortTermInvestments || 0)
  const debt = debtCurrent === null && debtLongTerm === null ? null : Math.max(debtCurrent || 0, 0) + Math.max(debtLongTerm || 0, 0)
  const revenueGrowth = revenue !== null && priorRevenue > 0 ? (revenue - priorRevenue) / priorRevenue : null
  const grossMargin = revenue > 0 && grossProfit !== null ? grossProfit / revenue : null
  const priorGrossMargin = priorRevenue > 0 && priorGrossProfit !== null ? priorGrossProfit / priorRevenue : null
  const marginChangeYoy = grossMargin !== null && priorGrossMargin !== null ? grossMargin - priorGrossMargin : null
  const ebitda = operatingIncome !== null && depreciationAmortization !== null ? operatingIncome + Math.abs(depreciationAmortization) : null
  const freeCashFlow = operatingCashFlow !== null && capex !== null ? operatingCashFlow - Math.abs(capex) : null
  const classification = classifyCompany(`${summaryData?.summaryData?.Sector?.value || ""} ${summaryData?.summaryData?.Industry?.value || ""}`)
  const lifecycle = lifecycleFromFinancials(revenueGrowth || 0, netIncome || 0, freeCashFlow || 0)

  const measured = new Set()
  const inputs = {
    companyName: infoData?.companyName || ticker,
    ...classification,
    ...lifecycle,
    capitalStatus: "Public",
  }
  const setMeasured = (field, value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return
    inputs[field] = round(value, field === "eps" ? 4 : 2)
    measured.add(field)
  }
  setMeasured("revenue", revenue)
  setMeasured("revenueGrowth", revenueGrowth)
  setMeasured("grossMargin", grossMargin)
  setMeasured("marginChangeYoy", marginChangeYoy)
  setMeasured("opexRatio", revenue > 0 && grossProfit !== null && ebitda !== null ? Math.max((grossProfit - ebitda) / revenue, 0) : null)
  setMeasured("rdPct", revenue > 0 && rd !== null ? Math.abs(rd) / revenue : null)
  setMeasured("cash", totalCash)
  setMeasured("debt", debt)
  setMeasured("capexPct", revenue > 0 && capex !== null ? Math.abs(capex) / revenue : null)
  setMeasured("inventory", inventory)
  setMeasured("ar", ar)
  setMeasured("ap", ap)
  setMeasured("assetBackingValue", equity !== null ? equity : assets !== null && liabilities !== null ? assets - liabilities : null)
  setMeasured("roe", roe)
  setMeasured("sharesOutstanding", sharesOutstanding)
  if (ppe !== null) {
    inputs.asset1Type = "Equipment / Machinery"
    inputs.asset1Value = round(ppe, 2)
  }

  const sourceNotes = Object.fromEntries([...measured].map((field) => [field, `Nasdaq annual financials; ${inputs[field] === 0 ? "measured zero" : "reported or derived value"} for ${periodEnd || "latest period"}`]))
  const provenance = [...measured].map((field) => sourceRecord("Nasdaq", field, inputs[field], "annual financials", periodEnd))
  return {
    provider: "Nasdaq",
    ticker,
    periodEnd,
    inputs,
    sourceNotes,
    availableFields: [...measured],
    coverage: [...measured],
    provenance,
    warnings: [],
    marketSeries: {
      provider: "Nasdaq",
      currentPrice: currentPrice || 0,
      currentMarketCap: currentMarketCap || 0,
      annualDividendPerShare: annualDividendPerShare || 0,
      annualDividendAvailable: annualDividendPerShare !== null,
      prices: [],
      asOf: nasdaqDate(infoData?.primaryData?.lastTradeTimestamp || ""),
    },
  }
}

export function normalizeMarketSeries(seriesByProvider, sharesOutstanding = 0) {
  const valid = seriesByProvider.filter((item) => item && (item.currentPrice > 0 || item.prices?.length))
  const currentCandidates = valid.filter((item) => item.currentPrice > 0).map((item) => ({ provider: item.provider, value: item.currentPrice }))
  const currentPrice = median(currentCandidates.map((item) => item.value))
  const primary = valid.find((item) => item.provider === "Yahoo Finance" && item.prices?.length)
    || valid.find((item) => item.prices?.length)
    || valid[0]
  const recentPrices = (primary?.prices || []).filter((value) => value > 0).slice(-20)
  const averagePrice = recentPrices.length ? recentPrices.reduce((sum, value) => sum + value, 0) / recentPrices.length : currentPrice
  const marketCapCandidates = valid.filter((item) => item.currentMarketCap > 0).map((item) => ({ provider: item.provider, value: item.currentMarketCap }))
  const reportedMarketCap = median(marketCapCandidates.map((item) => item.value))
  const priceDerivedMarketCap = currentPrice > 0 && sharesOutstanding > 0 ? currentPrice * sharesOutstanding : 0
  const currentMarketCap = reportedMarketCap || priceDerivedMarketCap
  const averageMarketCap = currentMarketCap > 0 && currentPrice > 0
    ? currentMarketCap * averagePrice / currentPrice
    : averagePrice * sharesOutstanding
  const impliedSharesOutstanding = reportedMarketCap > 0 && currentPrice > 0 ? reportedMarketCap / currentPrice : sharesOutstanding
  const crossChecks = []
  const warnings = []
  const priceAnchor = currentCandidates.find((item) => item.provider === primary?.provider) || currentCandidates[0]
  for (const candidate of currentCandidates) {
    if (!priceAnchor || candidate.provider === priceAnchor.provider) continue
    const difference = Math.abs(candidate.value - priceAnchor.value) / Math.max(Math.abs(priceAnchor.value), 1e-9)
    const status = difference <= 0.03 ? "matched" : "review"
    crossChecks.push({ field: "sharePrice", primaryProvider: priceAnchor.provider, primaryValue: round(priceAnchor.value, 4), comparisonProvider: candidate.provider, comparisonValue: round(candidate.value, 4), differencePct: round(difference), status })
    if (status === "review") warnings.push(`Share price differs by ${round(difference * 100, 1)}% between ${priceAnchor.provider} and ${candidate.provider}.`)
  }
  if (reportedMarketCap > 0 && priceDerivedMarketCap > 0) {
    const difference = Math.abs(reportedMarketCap - priceDerivedMarketCap) / Math.max(Math.abs(reportedMarketCap), 1)
    const status = difference <= 0.08 ? "matched" : "review"
    crossChecks.push({ field: "marketCapitalization", primaryProvider: marketCapCandidates.map((item) => item.provider).join(" + "), primaryValue: round(reportedMarketCap, 2), comparisonProvider: "price x filing shares", comparisonValue: round(priceDerivedMarketCap, 2), differencePct: round(difference), status })
    if (status === "review") warnings.push(`Reported market capitalization differs by ${round(difference * 100, 1)}% from price multiplied by filing shares; reported market capitalization is used for the comparison baseline.`)
  }
  const dividendSource = valid.find((item) => item.annualDividendAvailable) || valid.find((item) => item.annualDividendPerShare > 0)
  return {
    currentPrice: round(currentPrice, 4),
    averagePrice: round(averagePrice, 4),
    tradingDays: recentPrices.length,
    currentMarketCap: round(currentMarketCap, 2),
    averageMarketCap: round(averageMarketCap, 2),
    impliedSharesOutstanding: round(impliedSharesOutstanding, 2),
    annualDividendPerShare: round(number(dividendSource?.annualDividendPerShare), 6),
    annualDividendAvailable: Boolean(dividendSource),
    asOf: primary?.asOf || "",
    providers: [...new Set(valid.map((item) => item.provider))],
    crossChecks,
    warning: warnings.join(" "),
  }
}

export function finalizeNormalizedInputs(secNormalized, marketSnapshot, supplements = []) {
  const inputs = { ...secNormalized.inputs }
  const sourceNotes = { ...secNormalized.sourceNotes }
  const warnings = [...secNormalized.warnings]
  const provenance = [...secNormalized.provenance]
  const availableFields = new Set(secNormalized.availableFields || secNormalized.coverage || [])
  const providerByField = new Map([...availableFields].map((field) => [field, secNormalized.provider || "SEC"]))
  const crossChecks = [...(marketSnapshot.crossChecks || [])]
  const ratioFields = new Set(["revenueGrowth", "grossMargin", "marginChangeYoy", "opexRatio", "rdPct", "capexPct", "roe", "rotce", "dividendYield", "buybackYield"])

  for (const supplement of supplements) {
    const explicitlyAvailable = new Set(supplement.availableFields || supplement.coverage || [])
    for (const [field, value] of Object.entries(supplement.inputs || {})) {
      if (typeof value === "string") {
        if (!inputs[field] || inputs[field] === "Other" || inputs[field] === secNormalized.ticker) {
          inputs[field] = value
          sourceNotes[field] = `${supplement.provider}; issuer profile fallback`
        }
        continue
      }
      if (typeof value !== "number" || !Number.isFinite(value)) continue
      const supplementMeasured = explicitlyAvailable.has(field) || (!supplement.availableFields && value !== 0)
      if (!supplementMeasured) continue
      if (!availableFields.has(field)) {
        inputs[field] = value
        availableFields.add(field)
        providerByField.set(field, supplement.provider)
        sourceNotes[field] = `${supplement.provider}; ${value === 0 ? "measured zero" : "fallback value"} because the primary filing value was unavailable`
      } else if (typeof inputs[field] === "number" && Number.isFinite(inputs[field])) {
        const primaryValue = inputs[field]
        const absoluteDifference = Math.abs(primaryValue - value)
        const relativeDifference = absoluteDifference / Math.max(Math.abs(primaryValue), Math.abs(value), 1e-9)
        const matched = ratioFields.has(field)
          ? absoluteDifference <= 0.03 || relativeDifference <= 0.2
          : relativeDifference <= 0.12
        const check = {
          field,
          primaryProvider: providerByField.get(field) || secNormalized.provider || "SEC",
          primaryValue: round(primaryValue, 6),
          comparisonProvider: supplement.provider,
          comparisonValue: round(value, 6),
          differencePct: round(relativeDifference),
          status: matched ? "matched" : "review",
        }
        crossChecks.push(check)
        if (!matched) warnings.push(`${field} differs by ${round(relativeDifference * 100, 1)}% between ${check.primaryProvider} and ${supplement.provider}; the primary value was retained.`)
      }
    }
    provenance.push(...(supplement.provenance || []))
    warnings.push(...(supplement.warnings || []))
  }

  // The observed-market comparison (implied fair value vs. real market value) must anchor
  // to the CURRENT price, not a trailing average — a stale smoothed price can diverge
  // sharply from today's actual value during a rally/selloff and produce a wildly
  // misleading upside/downside percentage. The trailing average is still computed and
  // returned in marketSnapshot for reference/display and for ratio-based fields
  // (dividendYield/buybackYield below) where smoothing a noisy single-day price is
  // legitimate; it just no longer drives the primary comparison.
  if (marketSnapshot.currentPrice > 0) {
    inputs.sharePrice = marketSnapshot.currentPrice
    sourceNotes.sharePrice = `Current price from ${marketSnapshot.providers.join(" + ")}; as of ${marketSnapshot.asOf}`
    availableFields.add("sharePrice")
    providerByField.set("sharePrice", marketSnapshot.providers.join(" + "))
  } else if (marketSnapshot.averagePrice > 0) {
    // Fallback only when no provider returned a live current price.
    inputs.sharePrice = marketSnapshot.averagePrice
    sourceNotes.sharePrice = `${marketSnapshot.tradingDays}-trading-day average from ${marketSnapshot.providers.join(" + ")} (current price unavailable); as of ${marketSnapshot.asOf}`
    availableFields.add("sharePrice")
    providerByField.set("sharePrice", marketSnapshot.providers.join(" + "))
  }
  if (marketSnapshot.impliedSharesOutstanding > 0) {
    const filingShares = Number(inputs.sharesOutstanding) || 0
    const difference = filingShares > 0
      ? Math.abs(filingShares - marketSnapshot.impliedSharesOutstanding) / Math.max(Math.abs(marketSnapshot.impliedSharesOutstanding), 1)
      : 1
    if (!availableFields.has("sharesOutstanding") || difference > 0.08) {
      if (availableFields.has("sharesOutstanding")) warnings.push(`Filing shares differ by ${round(difference * 100, 1)}% from shares implied by reported market capitalization; the market-implied share count is used.`)
      inputs.sharesOutstanding = marketSnapshot.impliedSharesOutstanding
      sourceNotes.sharesOutstanding = "Reported market capitalization divided by cross-checked current share price"
      availableFields.add("sharesOutstanding")
      providerByField.set("sharesOutstanding", "Nasdaq market capitalization + cross-checked price")
    }
  }
  const marketBase = marketSnapshot.averageMarketCap || marketSnapshot.currentMarketCap
  if (marketBase > 0) {
    const filingDividendMeasured = Boolean(secNormalized.measuredRawMetrics?.dividendsPaid)
    const marketDividendMeasured = Boolean(marketSnapshot.annualDividendAvailable)
    inputs.dividendYield = filingDividendMeasured
      ? round(secNormalized.rawMetrics.dividendsPaid / marketBase)
      : marketDividendMeasured && marketSnapshot.averagePrice > 0
        ? round(marketSnapshot.annualDividendPerShare / marketSnapshot.averagePrice)
        : 0
    inputs.buybackYield = round(secNormalized.rawMetrics.buybacks / marketBase)
    if (filingDividendMeasured || marketDividendMeasured) {
      availableFields.add("dividendYield")
      providerByField.set("dividendYield", filingDividendMeasured ? secNormalized.provider || "SEC" : marketSnapshot.providers.join(" + "))
    }
    if (secNormalized.measuredRawMetrics?.buybacks) {
      availableFields.add("buybackYield")
      providerByField.set("buybackYield", secNormalized.provider || "SEC")
    }
    sourceNotes.dividendYield = filingDividendMeasured
      ? "Annual cash dividends paid divided by recent average market capitalization"
      : marketDividendMeasured
        ? "Trailing market-feed dividends per share divided by recent average share price"
        : "Missing - no measured dividend value was returned"
    sourceNotes.buybackYield = secNormalized.measuredRawMetrics?.buybacks
      ? "Annual common-stock repurchases divided by recent average market capitalization"
      : "Missing - no measured repurchase value was returned"
  }
  if (marketSnapshot.warning) warnings.push(marketSnapshot.warning)

  const applicable = applicableFinancialFields(inputs)
  const missing = applicable.filter((field) => !availableFields.has(field))
  const fieldStatus = Object.fromEntries(applicable.map((field) => [
    field,
    !availableFields.has(field) ? "missing" : Number(inputs[field]) === 0 ? "measured-zero" : "measured",
  ]))
  return {
    inputs,
    sourceNotes,
    provenance,
    warnings: [...new Set(warnings)],
    missing,
    fieldStatus,
    crossChecks,
    coverage: {
      populated: applicable.length - missing.length,
      total: applicable.length,
      percent: round((applicable.length - missing.length) / applicable.length),
    },
  }
}

function applicableFinancialFields(inputs) {
  const financial = inputs.businessModel === "Financial / Balance-Sheet Business"
  const fields = ["revenue", "revenueGrowth", "cash", "debt", "tangibleBookValue", "assetBackingValue", "roe", "rotce", "eps", "sharePrice", "sharesOutstanding", "dividendYield", "buybackYield"]
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

export async function fetchNasdaqSupplement(ticker) {
  const encoded = encodeURIComponent(ticker)
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; EvalSystem2/1.0)",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  }
  const [financials, info, summary] = await Promise.all([
    fetchJson(`https://api.nasdaq.com/api/company/${encoded}/financials?frequency=1`, { headers }),
    fetchJson(`https://api.nasdaq.com/api/quote/${encoded}/info?assetclass=stocks`, { headers }),
    fetchJson(`https://api.nasdaq.com/api/quote/${encoded}/summary?assetclass=stocks`, { headers }),
  ])
  if (!financials?.data || !info?.data) throw new Error("Nasdaq returned no company financials.")
  return normalizeNasdaqCompany({ ticker, financials, info, summary })
}

export async function fetchAlphaVantageSupplement(ticker, apiKey) {
  if (!apiKey) return null
  const base = "https://www.alphavantage.co/query"
  const [overview, quote] = await Promise.all([
    fetchJson(`${base}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`),
  ])
  const shares = number(overview.SharesOutstanding)
  // Alpha Vantage's free OVERVIEW endpoint reports book value per share rather than a
  // total, and does not split out goodwill/intangibles. Used as a failsafe (only fills a
  // gap when the SEC filing itself is unavailable) so a per-share-only source is still
  // better than a fully missing field.
  const bookValuePerShareTotal = shares > 0 ? number(overview.BookValue) * shares : 0
  const inputs = {
    companyName: overview.Name || ticker,
    ...classifyCompany(`${overview.Sector || ""} ${overview.Industry || ""}`),
    ...lifecycleFromFinancials(number(overview.QuarterlyRevenueGrowthYOY), number(overview.RevenueTTM) * number(overview.ProfitMargin), 0),
    capitalStatus: "Public",
    revenue: number(overview.RevenueTTM),
    grossMargin: number(overview.GrossProfitTTM) / Math.max(number(overview.RevenueTTM), 1),
    sharesOutstanding: shares,
    eps: number(overview.EPS),
    tangibleBookValue: bookValuePerShareTotal,
    assetBackingValue: bookValuePerShareTotal,
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
  const [profileRows, incomeRows, balanceRows, cashRows, keyMetricsRows] = await Promise.all([
    fetchJson(`${base}/profile/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/income-statement/${encodeURIComponent(ticker)}?limit=2&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/balance-sheet-statement/${encodeURIComponent(ticker)}?limit=1&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/cash-flow-statement/${encodeURIComponent(ticker)}?limit=1&apikey=${encodeURIComponent(apiKey)}`),
    fetchJson(`${base}/key-metrics/${encodeURIComponent(ticker)}?limit=1&apikey=${encodeURIComponent(apiKey)}`).catch(() => null),
  ])
  const profile = profileRows?.[0] || {}
  const income = incomeRows?.[0] || {}
  const priorIncome = incomeRows?.[1] || {}
  const balance = balanceRows?.[0] || {}
  const cashFlow = cashRows?.[0] || {}
  const keyMetrics = keyMetricsRows?.[0] || {}
  const revenue = number(income.revenue)
  const priorRevenue = number(priorIncome.revenue)
  const debt = number(balance.shortTermDebt) + number(balance.longTermDebt)
  const freeCashFlow = number(cashFlow.freeCashFlow) || number(cashFlow.operatingCashFlow) - Math.abs(number(cashFlow.capitalExpenditure))
  const revenueGrowth = priorRevenue > 0 ? (revenue - priorRevenue) / priorRevenue : 0
  const shares = number(profile.mktCap) > 0 && number(profile.price) > 0 ? number(profile.mktCap) / number(profile.price) : 0
  const equity = number(balance.totalStockholdersEquity)
  const goodwillAndIntangibles = number(balance.goodwill) + number(balance.intangibleAssets)
  // Prefer the direct balance-sheet calc (equity net of goodwill/intangibles); when the
  // balance-sheet statement itself is missing or incomplete for a ticker, fall back to the
  // per-share figures FMP's key-metrics endpoint reports, multiplied back out by share count.
  const directTangibleBookValue = equity > 0 ? Math.max(equity - goodwillAndIntangibles, 0) : 0
  const perShareTangibleBookValue = shares > 0 ? number(keyMetrics.tangibleBookValuePerShare) * shares : 0
  const perShareBookValue = shares > 0 ? number(keyMetrics.bookValuePerShare) * shares : 0
  const tangibleBookValue = directTangibleBookValue > 0 ? directTangibleBookValue : perShareTangibleBookValue > 0 ? perShareTangibleBookValue : perShareBookValue
  const assetBackingValue = equity > 0 ? equity : perShareBookValue
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
    tangibleBookValue,
    assetBackingValue,
    capexPct: revenue > 0 ? Math.abs(number(cashFlow.capitalExpenditure)) / revenue : 0,
    inventory: number(balance.inventory),
    ar: number(balance.netReceivables),
    ap: number(balance.accountPayables),
    sharesOutstanding: shares,
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

// Orchestrates a full ticker ingestion shared by the dev server, the deployed worker, and
// the background screener. Financial Modeling Prep has a hard daily call cap on the plan
// this project uses (each fetchFmpSupplement call alone costs 5 FMP requests), so it is
// deliberately excluded from the first, parallel round of provider calls and only invoked
// afterward, and only when SEC + Yahoo + Nasdaq + Alpha Vantage still leave fields missing -
// a last-resort backfill, never a verifier spent cross-checking data that already resolved.
export async function ingestTicker(ticker, options = {}) {
  const cacheKey = ticker.toUpperCase()
  const secUserAgent = options.secUserAgent || "eval-system-2 financial normalization contact@example.com"
  const alphaVantageApiKey = options.alphaVantageApiKey
  const fmpApiKey = options.fmpApiKey
  const providerWarnings = []

  const [bundle, yahoo, nasdaq, alpha] = await Promise.all([
    fetchSecBundle(cacheKey, secUserAgent).catch((error) => {
      providerWarnings.push(`SEC unavailable: ${error.message}`)
      return null
    }),
    fetchYahooMarketSeries(cacheKey).catch((error) => {
      providerWarnings.push(`Yahoo Finance unavailable: ${error.message}`)
      return null
    }),
    fetchNasdaqSupplement(cacheKey).catch((error) => {
      providerWarnings.push(`Nasdaq unavailable: ${error.message}`)
      return null
    }),
    fetchAlphaVantageSupplement(cacheKey, alphaVantageApiKey).catch((error) => {
      providerWarnings.push(`Alpha Vantage unavailable: ${error.message}`)
      return null
    }),
  ])

  const sec = bundle ? normalizeSecCompany(bundle) : emptyNormalizedCompany(cacheKey)
  let supplements = [nasdaq, alpha].filter(Boolean)
  let marketSources = [yahoo, nasdaq?.marketSeries, alpha?.marketSeries].filter(Boolean)
  let shares = sec.inputs.sharesOutstanding || supplements.find((item) => item.inputs?.sharesOutstanding)?.inputs.sharesOutstanding || 0
  let marketSnapshot = normalizeMarketSeries(marketSources, shares)
  let normalized = finalizeNormalizedInputs(sec, marketSnapshot, supplements)

  let fmp = null
  let usedFmp = false
  const noStatementData = !bundle && !supplements.some((item) => item.inputs?.revenue > 0)
  // A single stray gap (dividendYield/buybackYield are absent, not zero, for most companies
  // that don't pay one) shouldn't spend an FMP call - reserve the budget for companies that
  // are genuinely thin on data, plus the true last-resort case where nothing resolved at all.
  const missingThreshold = options.fmpMissingThreshold ?? 3
  if (fmpApiKey && (normalized.missing.length >= missingThreshold || noStatementData)) {
    usedFmp = true
    fmp = await fetchFmpSupplement(cacheKey, fmpApiKey).catch((error) => {
      providerWarnings.push(`Financial Modeling Prep unavailable: ${error.message}`)
      return null
    })
    if (fmp) {
      supplements = [...supplements, fmp]
      marketSources = [...marketSources, fmp.marketSeries].filter(Boolean)
      shares = sec.inputs.sharesOutstanding || supplements.find((item) => item.inputs?.sharesOutstanding)?.inputs.sharesOutstanding || 0
      marketSnapshot = normalizeMarketSeries(marketSources, shares)
      normalized = finalizeNormalizedInputs(sec, marketSnapshot, supplements)
    }
  }

  if (!bundle && !supplements.some((item) => item.inputs?.revenue > 0)) {
    throw new Error(`No financial-statement provider returned data for ${cacheKey}. Configure ALPHA_VANTAGE_API_KEY or FMP_API_KEY for non-SEC issuers.`)
  }
  normalized.warnings.push(...providerWarnings)

  return {
    ticker: cacheKey,
    company: bundle?.company || { ticker: cacheKey, title: normalized.inputs.companyName },
    periodEnd: sec.periodEnd,
    marketSnapshot,
    providers: [bundle ? "SEC" : null, ...marketSources.map((item) => item.provider), ...supplements.map((item) => item.provider)]
      .filter((item, index, all) => item && all.indexOf(item) === index),
    usedFmp,
    ...normalized,
  }
}

export { ENGINE_FINANCIAL_FIELDS }
