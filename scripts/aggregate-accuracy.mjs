// Aggregates engine accuracy across every real company run so far and reports
// the average deviation from observed market cap and the share that land inside
// the modeled fair-value band. Run: node scripts/aggregate-accuracy.mjs
import { computeValuation, FIXTURES } from "../src/valuationEngine.js"
import { COMPANIES as SET_A } from "./scenario-attribution.mjs"
import { COMPANIES as SET_B } from "./scenario-global.mjs"

const realFixtures = ["Costco 2025 Public", "JPMorgan 2025 Public", "Eli Lilly 2025 Public", "Rocket Lab 2025 Public"].map((k) => FIXTURES[k])
const all = [...SET_A, ...SET_B, ...realFixtures]

// dedupe by companyName (keep first)
const seen = new Set()
const companies = all.filter((c) => (seen.has(c.companyName) ? false : (seen.add(c.companyName), true)))

// Names where large deviation is intentional disagreement with market sentiment,
// not a calibration target (unprofitable/ speculative / actively re-rating).
const contested = new Set(["Snowflake", "Rocket Lab Corporation", "Celsius Holdings", "Novo Nordisk (DK)", "ASML (NL)"])

const rows = []
for (const c of companies) {
  const r = computeValuation(c)
  const obs = r.tracks.market.paths.observedEquity
  if (!(obs > 0)) continue
  const fair = r.outputs.fairCommonEquity
  const dev = (fair - obs) / obs
  const inBand = obs >= r.bands.final.low && obs <= r.bands.final.high
  rows.push({ name: c.companyName, fair, obs, dev, inBand, contested: contested.has(c.companyName) })
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))) }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const pct = (x) => (x * 100).toFixed(0) + "%"

function report(label, set) {
  if (!set.length) return
  const absDev = set.map((r) => Math.abs(r.dev))
  const inBand = set.filter((r) => r.inBand).length / set.length
  console.log(`\n${label}  (n=${set.length})`)
  console.log(`  mean |deviation| (MAPE): ${pct(mean(absDev))}`)
  console.log(`  median |deviation|:      ${pct(median(absDev))}`)
  console.log(`  stdev of signed dev:     ${pct(stdev(set.map((r) => r.dev)))}`)
  console.log(`  observed inside modeled band: ${pct(inBand)} (${set.filter((r) => r.inBand).length}/${set.length})`)
}

console.log("=== PER-COMPANY (fair vs observed) ===")
console.log("Company".padEnd(28), "fair vs obs".padStart(12), "in band".padStart(9))
for (const r of rows.sort((a, b) => a.dev - b.dev)) {
  console.log(r.name.padEnd(28), ((r.dev >= 0 ? "+" : "") + pct(r.dev)).padStart(12), (r.inBand ? "yes" : "no").padStart(9), r.contested ? " (contested)" : "")
}

report("ALL companies", rows)
report("CALIBRATION set (excludes contested/ speculative names)", rows.filter((r) => !r.contested))
report("CONTESTED / speculative names", rows.filter((r) => r.contested))
