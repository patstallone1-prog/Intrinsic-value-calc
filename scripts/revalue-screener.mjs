// Recompute every recorded company's valuation from its stored inputs with the current engine -
// no network. Use after engine changes so the screener reflects them without a full re-ingestion.
// Usage: node scripts/revalue-screener.mjs
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AUTOMATED_BASE_INPUTS, computeValuation, normalizeInputs } from "../src/valuationEngine.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const resultsPath = path.join(root, "data/screener-results.jsonl")
const round = (v, d = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0)

const rows = (await fs.readFile(resultsPath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line))
const out = rows.map((row) => {
  const result = computeValuation(normalizeInputs({ ...AUTOMATED_BASE_INPUTS, companyName: row.companyName, sector: row.sector, businessModel: row.businessModel, ...(row.inputs || {}) }))
  const fair = result.outputs.fairCommonEquity
  const cap = row.observedMarketCap || 0
  return {
    ...row,
    fairCommonEquity: round(fair, 2),
    fairValueLow: round(result.bands.final.low, 2),
    fairValueHigh: round(result.bands.final.high, 2),
    impliedVsMarketPct: cap > 0 ? round(((fair - cap) / cap) * 100, 2) : null,
    inFairValueRange: cap > 0 ? result.bands.final.low <= cap && cap <= result.bands.final.high : null,
    confidence: round(result.bands.quality, 3),
    revaluedAt: new Date().toISOString(),
  }
})
await fs.writeFile(resultsPath, `${out.map((row) => JSON.stringify(row)).join("\n")}\n`)
console.log(`Revalued ${out.length} companies with the current engine.`)
