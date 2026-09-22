// Post-run pass over data/screener-results.jsonl: balance-sheet amounts that no source
// reported (debt, cash, tangible book, asset backing) are estimated from industry peers -
// the median field / market-cap ratio for the closest peer group (sector + business model,
// then sector, then business model, then market-wide) scaled to the company's market value -
// and the valuation is recomputed. Estimates are recorded separately from measured inputs so
// the site can show them as estimates and let a person override them. The peer ratios are
// also written to data/sector-ratios.json for the live app to use on single-ticker lookups.
//
// Usage: node scripts/impute-screener.mjs
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { applicableFinancialFields, peerRatio } from "../src/financialIngestion.js"
import { AUTOMATED_BASE_INPUTS, computeValuation, normalizeInputs } from "../src/valuationEngine.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const resultsPath = path.join(root, "data/screener-results.jsonl")
const ratiosPath = path.join(root, "data/sector-ratios.json")
const FIELDS = ["debt", "cash", "tangibleBookValue", "assetBackingValue"]

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN }
const round = (v, d = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0)

const raw = await fs.readFile(resultsPath, "utf8")
const rows = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line))

// 1. Peer ratios from measured rows only (a measured zero counts; an estimate never does).
const samples = {}
for (const row of rows) {
  const cap = row.observedMarketCap || 0
  if (!(cap > 0) || row.suspect) continue
  const inputs = { ...(row.inputs || {}), sector: row.sector, businessModel: row.businessModel }
  const applicable = applicableFinancialFields(inputs)
  const missing = new Set(row.missing || [])
  const estimated = new Set(Object.keys(row.estimated || {}))
  for (const field of FIELDS) {
    if (!applicable.includes(field) || missing.has(field) || estimated.has(field)) continue
    const value = Number(row.inputs?.[field] || 0)
    const ratio = value / cap
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 50) continue
    for (const key of [`${row.sector}::${row.businessModel}`, `sector::${row.sector}`, `model::${row.businessModel}`, "all"]) {
      samples[key] ??= {}
      samples[key][field] ??= []
      samples[key][field].push(ratio)
    }
  }
}
const sectorRatios = {}
for (const [key, byField] of Object.entries(samples)) {
  sectorRatios[key] = {}
  for (const [field, values] of Object.entries(byField)) sectorRatios[key][field] = { median: round(median(values), 6), count: values.length }
}
await fs.writeFile(ratiosPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), fields: FIELDS, groups: sectorRatios }, null, 2)}\n`)

// 2. Estimate what is missing, recompute, rewrite.
let touched = 0
const out = rows.map((row) => {
  const cap = row.observedMarketCap || 0
  const missing = [...(row.missing || [])]
  if (!(cap > 0) || !missing.some((field) => FIELDS.includes(field))) return row
  const inputs = { ...(row.inputs || {}) }
  const estimated = { ...(row.estimated || {}) }
  for (const field of FIELDS) {
    if (!missing.includes(field)) continue
    const ratio = peerRatio(sectorRatios, field, row.sector, row.businessModel)
    if (!ratio) continue
    inputs[field] = round(ratio.value * cap, 2)
    estimated[field] = { value: inputs[field], ratio: ratio.value, basis: ratio.basis, peers: ratio.peers }
    missing.splice(missing.indexOf(field), 1)
  }
  if (!Object.keys(estimated).length) return row
  touched += 1
  const result = computeValuation(normalizeInputs({ ...AUTOMATED_BASE_INPUTS, companyName: row.companyName, sector: row.sector, businessModel: row.businessModel, ...inputs }))
  const fair = result.outputs.fairCommonEquity
  const total = Math.max(row.applicableCount || 0, (row.missing || []).length, 1)
  return {
    ...row,
    inputs,
    estimated,
    missing,
    fairCommonEquity: round(fair, 2),
    fairValueLow: round(result.bands.final.low, 2),
    fairValueHigh: round(result.bands.final.high, 2),
    impliedVsMarketPct: round(((fair - cap) / cap) * 100, 2),
    inFairValueRange: result.bands.final.low <= cap && cap <= result.bands.final.high,
    confidence: round(result.bands.quality, 3),
    coveragePct: round(((total - missing.length) / total) * 100, 1),
    imputedAt: new Date().toISOString(),
  }
})
await fs.writeFile(resultsPath, `${out.map((row) => JSON.stringify(row)).join("\n")}\n`)
console.log(`Peer ratios for ${Object.keys(sectorRatios).length} groups written to data/sector-ratios.json; ${touched} of ${rows.length} companies received estimates.`)
