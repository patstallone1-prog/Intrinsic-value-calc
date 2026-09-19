import assert from "node:assert/strict"
import { emptyNormalizedCompany, finalizeNormalizedInputs, normalizeMarketSeries, normalizeSecCompany } from "../src/financialIngestion.js"

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

const finalized = finalizeNormalizedInputs(sec, market)
assert.equal(finalized.inputs.sharePrice, 25)
assert.equal(finalized.inputs.dividendYield, 0.02)
assert.equal(finalized.inputs.buybackYield, 0.01)
assert.equal(finalized.inputs.marketCapOverride, undefined, "recent price should drive observed market value without a stale override")
assert.ok(finalized.sourceNotes.sharePrice.includes("average"))
assert.ok(finalized.coverage.percent > 0.7)

const globalFallback = finalizeNormalizedInputs(emptyNormalizedCompany("GLOBAL"), market, [{
  provider: "Example Global Feed",
  inputs: { companyName: "Global Plc", sector: "Manufacturing / Industrials", businessModel: "Manufacturing / Production", revenue: 900, sharesOutstanding: 40 },
  provenance: [],
  warnings: [],
}])
assert.equal(globalFallback.inputs.companyName, "Global Plc")
assert.equal(globalFallback.inputs.sector, "Manufacturing / Industrials")
assert.equal(globalFallback.inputs.revenue, 900)

console.log("financial ingestion tests passed")
