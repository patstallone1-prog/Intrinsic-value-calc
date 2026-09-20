import assert from "node:assert/strict"
import { emptyNormalizedCompany, finalizeNormalizedInputs, normalizeMarketSeries, normalizeNasdaqCompany, normalizeSecCompany } from "../src/financialIngestion.js"

function annual(val, start, end, fy) {
  return { val, start, end, fy, fp: "FY", form: "10-K", filed: `${Number(end.slice(0, 4)) + 1}-02-15` }
}

function instant(val, end) {
  return { val, end, form: "10-K", filed: `${Number(end.slice(0, 4)) + 1}-02-15` }
}

function usd(rows) {
  return { units: { USD: rows } }
}

const facts = {
  "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: usd([
      annual(800, "2023-01-01", "2023-12-31", 2023),
      annual(1_000, "2024-01-01", "2024-12-31", 2024),
    ]),
    GrossProfit: usd([
      annual(320, "2023-01-01", "2023-12-31", 2023),
      annual(450, "2024-01-01", "2024-12-31", 2024),
    ]),
    OperatingIncomeLoss: usd([annual(150, "2024-01-01", "2024-12-31", 2024)]),
    DepreciationDepletionAndAmortization: usd([annual(30, "2024-01-01", "2024-12-31", 2024)]),
    NetIncomeLoss: usd([annual(100, "2024-01-01", "2024-12-31", 2024)]),
    NetCashProvidedByUsedInOperatingActivities: usd([annual(170, "2024-01-01", "2024-12-31", 2024)]),
    PaymentsToAcquirePropertyPlantAndEquipment: usd([annual(50, "2024-01-01", "2024-12-31", 2024)]),
    ResearchAndDevelopmentExpense: usd([annual(60, "2023-01-01", "2023-12-31", 2023)]),
    ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: usd([annual(70, "2024-01-01", "2024-12-31", 2024)]),
    PaymentsOfDividendsCommonStock: usd([annual(20, "2024-01-01", "2024-12-31", 2024)]),
    PaymentsForRepurchaseOfCommonStock: usd([annual(10, "2024-01-01", "2024-12-31", 2024)]),
    EarningsPerShareDiluted: { units: { "USD/shares": [annual(2.5, "2024-01-01", "2024-12-31", 2024)] } },
    CashAndCashEquivalentsAtCarryingValue: usd([instant(200, "2024-12-31")]),
    ShortTermInvestments: usd([instant(50, "2024-12-31")]),
    LongTermDebtNoncurrent: usd([instant(120, "2024-12-31")]),
    InventoryNet: usd([instant(80, "2024-12-31")]),
    AccountsReceivableNetCurrent: usd([instant(90, "2024-12-31")]),
    AccountsPayableCurrent: usd([instant(60, "2024-12-31")]),
    Assets: usd([instant(1_400, "2024-12-31")]),
    Liabilities: usd([instant(700, "2024-12-31")]),
    StockholdersEquity: usd([instant(700, "2024-12-31"), instant(600, "2023-12-31")]),
    Goodwill: usd([instant(100, "2024-12-31")]),
    IntangibleAssetsNetExcludingGoodwill: usd([instant(50, "2024-12-31")]),
    PropertyPlantAndEquipmentNet: usd([instant(400, "2024-12-31")]),
  },
  dei: {
    EntityCommonStockSharesOutstanding: { units: { shares: [instant(40, "2025-02-01")] } },
  },
}

const sec = normalizeSecCompany({
  company: { ticker: "TEST", title: "Test Public Co", cik: "0000000001" },
  submissions: { sicDescription: "Prepackaged Software" },
  facts,
})

assert.equal(sec.inputs.revenue, 1_000)
assert.equal(sec.inputs.revenueGrowth, 0.25)
assert.equal(sec.inputs.grossMargin, 0.45)
assert.equal(sec.inputs.marginChangeYoy, 0.05)
assert.equal(sec.inputs.opexRatio, 0.27, "OpEx basis should use EBITDA and avoid double-counting D&A")
assert.equal(sec.inputs.rdPct, 0.07)
assert.equal(sec.inputs.capexPct, 0.05)
assert.equal(sec.inputs.cash, 250)
assert.equal(sec.inputs.debt, 120)
assert.equal(sec.inputs.tangibleBookValue, 550)
assert.equal(sec.inputs.assetBackingValue, 700, "asset backing should be equity-like, not un-netted total assets")
assert.equal(sec.inputs.sharesOutstanding, 40)
assert.equal(sec.rawMetrics.freeCashFlow, 120)

const market = normalizeMarketSeries([
  { provider: "Yahoo Finance", currentPrice: 30, prices: [20, 22, 24, 26, 28, 30], asOf: "2025-01-31" },
  { provider: "Financial Modeling Prep", currentPrice: 31, prices: [], asOf: "2025-01-31" },
], 40)
assert.equal(market.currentPrice, 30.5)
assert.equal(market.averagePrice, 25)
assert.equal(market.averageMarketCap, 1_000)

const crossCheckedMarket = normalizeMarketSeries([
  { provider: "Yahoo Finance", currentPrice: 30, prices: [20, 22, 24, 26, 28, 30], asOf: "2025-01-31" },
  { provider: "Nasdaq", currentPrice: 30, currentMarketCap: 1_200, prices: [], asOf: "2025-01-31" },
], 20)
assert.equal(crossCheckedMarket.currentMarketCap, 1_200, "reported market cap should replace a mismatched price-times-filing-shares baseline")
assert.equal(crossCheckedMarket.averageMarketCap, 1_000, "20-day average market value should use the cross-checked share basis")
assert.equal(crossCheckedMarket.impliedSharesOutstanding, 40)
assert.equal(crossCheckedMarket.crossChecks.find((check) => check.field === "marketCapitalization")?.status, "review")

const finalized = finalizeNormalizedInputs(sec, market)
assert.equal(finalized.inputs.sharePrice, 30.5, "the observed-market comparison must anchor to the CURRENT price, not the trailing average, or a stale price can make the implied-vs-market percentage wildly misleading")
assert.equal(finalized.inputs.dividendYield, 0.02)
assert.equal(finalized.inputs.buybackYield, 0.01)
assert.equal(finalized.inputs.marketCapOverride, undefined, "recent price should drive observed market value without a stale override")
assert.ok(finalized.sourceNotes.sharePrice.includes("Current price"))

// Fallback: when no provider returns a live current price, fall back to the trailing average.
const averageOnlyMarket = normalizeMarketSeries([
  { provider: "Yahoo Finance", currentPrice: 0, prices: [20, 22, 24, 26, 28, 30], asOf: "2025-01-31" },
], 40)
assert.equal(averageOnlyMarket.currentPrice, 0)
const averageOnlyFinalized = finalizeNormalizedInputs(sec, averageOnlyMarket)
assert.equal(averageOnlyFinalized.inputs.sharePrice, 25, "should fall back to the trailing average only when no current price is available")
assert.ok(averageOnlyFinalized.sourceNotes.sharePrice.includes("average") && averageOnlyFinalized.sourceNotes.sharePrice.includes("unavailable"))
assert.ok(finalized.coverage.percent > 0.7)

const crossSource = finalizeNormalizedInputs(sec, market, [{
  provider: "Nasdaq",
  inputs: { revenue: 1_400, cash: 250 },
  availableFields: ["revenue", "cash"],
  provenance: [],
  warnings: [],
}])
assert.equal(crossSource.crossChecks.find((check) => check.field === "revenue")?.status, "review")
assert.equal(crossSource.crossChecks.find((check) => check.field === "cash")?.status, "matched")

const zeroFacts = structuredClone(facts)
zeroFacts["us-gaap"].ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost.units.USD[0].val = 0
const measuredZero = finalizeNormalizedInputs(normalizeSecCompany({
  company: { ticker: "ZERO", title: "Measured Zero Co", cik: "0000000002" },
  submissions: { sicDescription: "Prepackaged Software" },
  facts: zeroFacts,
}), market)
assert.equal(measuredZero.inputs.rdPct, 0)
assert.equal(measuredZero.fieldStatus.rdPct, "measured-zero", "a source row containing zero must remain distinguishable from missing data")
assert.ok(!measuredZero.missing.includes("rdPct"))

const nasdaq = normalizeNasdaqCompany({
  ticker: "TEST",
  financials: { data: {
    incomeStatementTable: { headers: { value2: "12/31/2024" }, rows: [
      { value1: "Total Revenue", value2: "$1,000", value3: "$800" },
      { value1: "Gross Profit", value2: "$450", value3: "$320" },
      { value1: "Operating Income", value2: "$150", value3: "$120" },
      { value1: "Net Income", value2: "$100", value3: "$80" },
      { value1: "Research and Development", value2: "$0", value3: "$0" },
    ] },
    balanceSheetTable: { rows: [
      { value1: "Cash and Cash Equivalents", value2: "$200" },
      { value1: "Short-Term Investments", value2: "$50" },
      { value1: "Long-Term Debt", value2: "$120" },
      { value1: "Total Equity", value2: "$700" },
    ] },
    cashFlowTable: { rows: [
      { value1: "Depreciation", value2: "$30" },
      { value1: "Net Cash Flow-Operating", value2: "$170" },
      { value1: "Capital Expenditures", value2: "-$50" },
    ] },
    financialRatiosTable: { rows: [{ value1: "After Tax ROE", value2: "14.2857%" }] },
  } },
  info: { data: { companyName: "Test Public Co", primaryData: { lastSalePrice: "$30", lastTradeTimestamp: "Jan 31, 2025" } } },
  summary: { data: { summaryData: { Sector: { value: "Software" }, Industry: { value: "Prepackaged Software" }, MarketCap: { value: "1,200,000" }, AnnualizedDividend: { value: "$0.00" } } } },
})
assert.equal(nasdaq.inputs.revenue, 1_000_000)
assert.equal(nasdaq.inputs.rdPct, 0)
assert.ok(nasdaq.availableFields.includes("rdPct"), "Nasdaq zero R&D should be treated as measured")
assert.equal(nasdaq.marketSeries.annualDividendAvailable, true)

const globalFallback = finalizeNormalizedInputs(emptyNormalizedCompany("GLOBAL"), market, [{
  provider: "Example Global Feed",
  inputs: { companyName: "Global Plc", sector: "Manufacturing / Industrials", businessModel: "Manufacturing / Production", revenue: 900, sharesOutstanding: 40 },
  provenance: [],
  warnings: [],
}])
assert.equal(globalFallback.inputs.companyName, "Global Plc")
assert.equal(globalFallback.inputs.sector, "Manufacturing / Industrials")
assert.equal(globalFallback.inputs.revenue, 900)

// Per-share failsafe: when SEC XBRL tagging doesn't yield a tangible book value (e.g. a
// foreign private issuer with no us-gaap facts), a supplement provider's per-share-derived
// total (book value per share x shares, as Alpha Vantage's OVERVIEW and FMP's key-metrics
// report) should fill the gap rather than leaving the field missing.
const perShareFallback = finalizeNormalizedInputs(emptyNormalizedCompany("PERSHARE"), market, [{
  provider: "Alpha Vantage",
  inputs: { companyName: "Per Share Co", revenue: 500, sharesOutstanding: 40, tangibleBookValue: 22 * 40, assetBackingValue: 22 * 40 },
  provenance: [],
  warnings: [],
}])
assert.equal(perShareFallback.inputs.tangibleBookValue, 880, "book-value-per-share x shares should fill tangibleBookValue when the primary filing value is missing")
assert.equal(perShareFallback.fieldStatus.tangibleBookValue, "measured")
assert.ok(!perShareFallback.missing.includes("tangibleBookValue"))

// When SEC already measured tangibleBookValue directly, a per-share-derived supplement value
// must only cross-check it, never silently override the primary filing-based figure.
const perShareCrossCheck = finalizeNormalizedInputs(sec, market, [{
  provider: "Financial Modeling Prep",
  inputs: { tangibleBookValue: 10 * 40 },
  availableFields: ["tangibleBookValue"],
  provenance: [],
  warnings: [],
}])
assert.equal(perShareCrossCheck.inputs.tangibleBookValue, 550, "primary SEC-derived tangibleBookValue should be retained over a conflicting per-share-derived supplement value")
assert.equal(perShareCrossCheck.crossChecks.find((check) => check.field === "tangibleBookValue")?.status, "review")

console.log("financial ingestion tests passed")
