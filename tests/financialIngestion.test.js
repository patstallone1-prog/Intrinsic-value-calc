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

// Inferred zeros: a filed cash-flow statement with no dividend/repurchase line and a filed
// balance sheet with no debt line (and negligible interest) are measured zeros, not gaps.
const inferredFacts = structuredClone(facts)
delete inferredFacts["us-gaap"].PaymentsOfDividendsCommonStock
delete inferredFacts["us-gaap"].PaymentsForRepurchaseOfCommonStock
delete inferredFacts["us-gaap"].LongTermDebtNoncurrent
inferredFacts["us-gaap"].NetCashProvidedByUsedInFinancingActivities = usd([annual(-40, "2024-01-01", "2024-12-31", 2024)])
const inferredSec = normalizeSecCompany({ company: { ticker: "INF", title: "Inferred Co", cik: "0000000003" }, submissions: {}, facts: inferredFacts })
assert.equal(inferredSec.inputs.debt, 0)
assert.ok(inferredSec.availableFields.includes("debt"), "no debt line on a filed balance sheet with no interest expense is a measured zero")
assert.equal(inferredSec.measuredRawMetrics.dividendsInferredZero, true)
assert.equal(inferredSec.measuredRawMetrics.buybacksInferredZero, true)
const inferredFinal = finalizeNormalizedInputs(inferredSec, averageOnlyMarket)
assert.equal(inferredFinal.fieldStatus.dividendYield, "measured-zero", "absent dividend line on a filed cash-flow statement is a measured zero")
assert.equal(inferredFinal.fieldStatus.buybackYield, "measured-zero", "absent repurchase line on a filed cash-flow statement is a measured zero")
assert.ok(inferredFinal.sourceNotes.dividendYield.includes("Measured zero"))

// Material interest expense with no recognized debt tag means the debt is probably under a
// custom tag - leave it missing for a human rather than silently zeroing it.
const interestFacts = structuredClone(inferredFacts)
interestFacts["us-gaap"].InterestExpense = usd([annual(25, "2024-01-01", "2024-12-31", 2024)])
const interestSec = normalizeSecCompany({ company: { ticker: "INT", title: "Interest Co", cik: "0000000004" }, submissions: {}, facts: interestFacts })
assert.ok(!interestSec.availableFields.includes("debt"), "material interest expense without a debt tag must stay missing")

// Debt assembly never double-counts: the all-in LongTermDebt tag already includes current
// maturities, so LongTermDebtCurrent is skipped when it is the only long-term tag present.
const inclusiveFacts = structuredClone(facts)
delete inclusiveFacts["us-gaap"].LongTermDebtNoncurrent
inclusiveFacts["us-gaap"].LongTermDebt = usd([instant(150, "2024-12-31")])
inclusiveFacts["us-gaap"].LongTermDebtCurrent = usd([instant(30, "2024-12-31")])
inclusiveFacts["us-gaap"].ShortTermBorrowings = usd([instant(10, "2024-12-31")])
const inclusiveSec = normalizeSecCompany({ company: { ticker: "INC", title: "Inclusive Co", cik: "0000000005" }, submissions: {}, facts: inclusiveFacts })
assert.equal(inclusiveSec.inputs.debt, 160, "LongTermDebt (inclusive of current maturities) + short-term borrowings, without re-adding LongTermDebtCurrent")
const combinedFacts = structuredClone(inclusiveFacts)
combinedFacts["us-gaap"].DebtLongtermAndShorttermCombinedAmount = usd([instant(175, "2024-12-31")])
const combinedSec = normalizeSecCompany({ company: { ticker: "CMB", title: "Combined Co", cik: "0000000006" }, submissions: {}, facts: combinedFacts })
assert.equal(combinedSec.inputs.debt, 175, "a combined total debt tag wins outright over its pieces")

// Market feed: a full price history with no dividend events is a measured zero dividend.
const noDividendMarket = normalizeMarketSeries([
  { provider: "Yahoo Finance", currentPrice: 30, prices: Array.from({ length: 250 }, () => 30), annualDividendPerShare: 0, annualDividendAvailable: true, asOf: "2025-01-31" },
], 40)
assert.equal(noDividendMarket.annualDividendAvailable, true)
const noDivFacts = structuredClone(facts)
delete noDivFacts["us-gaap"].PaymentsOfDividendsCommonStock
const noDivFinal = finalizeNormalizedInputs(normalizeSecCompany({ company: { ticker: "NDV", title: "No Div Co", cik: "0000000007" }, submissions: {}, facts: noDivFacts }), noDividendMarket)
assert.equal(noDivFinal.fieldStatus.dividendYield, "measured-zero", "market feed with a full history and no dividend events is a measured zero")

// Period basis: annual filings are the default; when the latest 10-K is stale the flows come
// from a labelled trailing-twelve-month construction (10-K + later 10-Qs - same quarters a
// year earlier), never from a bare quarter treated as a year.
function quarter(val, start, end, fy, fp, form = "10-Q") {
  return { val, start, end, fy, fp, form, filed: end }
}
const ttmFacts = {
  "us-gaap": {
    Revenues: usd([
      annual(800, "2023-01-01", "2023-12-31", 2023),
      annual(1_000, "2024-01-01", "2024-12-31", 2024),
      quarter(180, "2023-01-01", "2023-03-31", 2023, "Q1"), quarter(190, "2023-04-01", "2023-06-30", 2023, "Q2"), quarter(200, "2023-07-01", "2023-09-30", 2023, "Q3"),
      quarter(230, "2024-01-01", "2024-03-31", 2024, "Q1"), quarter(240, "2024-04-01", "2024-06-30", 2024, "Q2"), quarter(250, "2024-07-01", "2024-09-30", 2024, "Q3"),
      quarter(300, "2025-01-01", "2025-03-31", 2025, "Q1"), quarter(310, "2025-04-01", "2025-06-30", 2025, "Q2"), quarter(320, "2025-07-01", "2025-09-30", 2025, "Q3"),
    ]),
    NetIncomeLoss: usd([
      annual(100, "2024-01-01", "2024-12-31", 2024),
      quarter(20, "2024-01-01", "2024-03-31", 2024, "Q1"), quarter(20, "2024-04-01", "2024-06-30", 2024, "Q2"), quarter(20, "2024-07-01", "2024-09-30", 2024, "Q3"),
      quarter(40, "2025-01-01", "2025-03-31", 2025, "Q1"), quarter(40, "2025-04-01", "2025-06-30", 2025, "Q2"), quarter(40, "2025-07-01", "2025-09-30", 2025, "Q3"),
    ]),
    StockholdersEquity: usd([instant(700, "2024-12-31"), { val: 760, end: "2025-09-30", form: "10-Q", filed: "2025-11-01" }]),
  },
}
const ttmSec = normalizeSecCompany({ company: { ticker: "TTM", title: "TTM Co", cik: "0000000008" }, submissions: {}, facts: ttmFacts, today: "2026-09-20" })
assert.equal(ttmSec.periodBasis, "ttm")
assert.equal(ttmSec.periodEnd, "2025-09-30")
assert.equal(ttmSec.inputs.revenue, 1_000 + 930 - 720, "TTM = FY2024 + Q1-Q3 2025 - Q1-Q3 2024")
assert.equal(ttmSec.inputs.revenueGrowth, round4((1_210 - (800 + 720 - 570)) / (800 + 720 - 570)), "growth compares like-for-like trailing periods")
assert.equal(ttmSec.rawMetrics.netIncome, 100 + 120 - 60)
assert.equal(ttmSec.inputs.assetBackingValue, 760, "balance-sheet instants align to the TTM period end")
assert.ok(ttmSec.warnings.some((w) => w.includes("trailing twelve months")))
assert.ok(ttmSec.sourceNotes.revenue.includes("trailing twelve months"))

const freshSec = normalizeSecCompany({ company: { ticker: "TTM", title: "TTM Co", cik: "0000000008" }, submissions: {}, facts: ttmFacts, today: "2025-06-01" })
assert.equal(freshSec.periodBasis, "annual", "a 10-K under 15 months old keeps the annual basis")
assert.equal(freshSec.inputs.revenue, 1_000)

const loneQuarterFacts = { "us-gaap": { Revenues: usd([quarter(250, "2025-07-01", "2025-09-30", 2025, "Q3")]) } }
const loneSec = normalizeSecCompany({ company: { ticker: "LQ", title: "Lone Quarter Co", cik: "0000000009" }, submissions: {}, facts: loneQuarterFacts, today: "2026-09-20" })
assert.equal(loneSec.periodBasis, "annual")
assert.equal(loneSec.inputs.revenue, 0, "a lone quarter is never annualized into a fake year; the field stays unfilled for a supplement provider or a person")
assert.ok(!loneSec.availableFields.includes("revenue"))
const fourQuarterFacts = { "us-gaap": { Revenues: usd([
  quarter(200, "2025-01-01", "2025-03-31", 2025, "Q1"), quarter(210, "2025-04-01", "2025-06-30", 2025, "Q2"),
  quarter(220, "2025-07-01", "2025-09-30", 2025, "Q3"), quarter(230, "2025-10-01", "2025-12-31", 2025, "Q4"),
]) } }
const fourSec = normalizeSecCompany({ company: { ticker: "FQ", title: "Four Quarter Co", cik: "0000000010" }, submissions: {}, facts: fourQuarterFacts, today: "2026-09-20" })
assert.equal(fourSec.periodBasis, "ttm")
assert.equal(fourSec.inputs.revenue, 860, "four consecutive quarters with no fiscal-year filing sum to a labelled TTM")
const gappedFacts = { "us-gaap": { Revenues: usd([
  annual(1_000, "2024-01-01", "2024-12-31", 2024),
  quarter(300, "2025-07-01", "2025-09-30", 2025, "Q3"), quarter(250, "2024-07-01", "2024-09-30", 2024, "Q3"),
]) } }
const gappedSec = normalizeSecCompany({ company: { ticker: "GAP", title: "Gapped Co", cik: "0000000011" }, submissions: {}, facts: gappedFacts, today: "2026-09-20" })
assert.equal(gappedSec.periodBasis, "annual", "quarters that don't chain contiguously from the fiscal year end can't form a TTM; the stale annual is kept and labelled")

function round4(value) {
  return Math.round(value * 10_000) / 10_000
}

// Foreign filers reporting in a home currency must never be read as USD.
const krwFacts = { "us-gaap": { Revenues: { units: { KRW: [annual(26_000_000_000_000, "2024-01-01", "2024-12-31", 2024)] } }, StockholdersEquity: { units: { KRW: [instant(18_000_000_000_000, "2024-12-31")] } } } }
const krwSec = normalizeSecCompany({ company: { ticker: "KRW", title: "Won Filer", cik: "0000000012" }, submissions: {}, facts: krwFacts, today: "2025-06-01" })
assert.equal(krwSec.inputs.revenue, 0, "KRW-denominated revenue must not be treated as dollars")
assert.ok(!krwSec.availableFields.includes("revenue") && !krwSec.availableFields.includes("assetBackingValue"))

console.log("financial ingestion tests passed")
